import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/*
 * ============================================================
 * TODO: SpeedSMS integration — chưa có API key/docs
 * ------------------------------------------------------------
 * Hiện tại CHƯA tích hợp SpeedSMS thật. Trong giai đoạn dev,
 * mã OTP được console.log ra Vercel logs để test thủ công.
 * Khi có API key + docs SpeedSMS:
 *   - Cắm code gọi API vào hàm sendSms() bên dưới.
 *   - Dùng process.env.SPEEDSMS_API_KEY (KHÔNG hardcode key).
 *   - Bỏ / giữ lại console.log tùy nhu cầu debug.
 * ============================================================
 */
async function sendSms(sdt, code) {
    // TODO: cắm SpeedSMS API ở đây, dùng process.env.SPEEDSMS_API_KEY
    // Trong giai đoạn dev: log ra Vercel logs để test
    console.log('OTP for', sdt, '=', code)
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // 1. Validate sdt
    let { sdt } = req.body || {}
    if (!sdt || typeof sdt !== 'string') {
        return res.status(400).json({ error: 'Thiếu số điện thoại' })
    }
    sdt = String(sdt).trim()

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // 2. Check SĐT thuộc về một driver đã đăng ký
    const { data: user, error: userErr } = await sb
        .from('users')
        .select('id, role')
        .eq('sdt', sdt)
        .maybeSingle()
    if (userErr) {
        return res.status(500).json({ error: userErr.message })
    }
    if (!user) {
        return res.status(404).json({ error: 'Số điện thoại chưa được đăng ký. Liên hệ chủ xe.' })
    }
    if (user.role !== 'driver') {
        return res.status(403).json({ error: 'Tài khoản này không dùng đăng nhập SMS' })
    }

    const now = Date.now()

    // 3. Rate limit lớp 1 — chống spam 60 giây
    const { data: lastCode, error: lastErr } = await sb
        .from('otp_codes')
        .select('created_at')
        .eq('sdt', sdt)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (lastErr) {
        return res.status(500).json({ error: lastErr.message })
    }
    if (lastCode && now - new Date(lastCode.created_at).getTime() < 60 * 1000) {
        return res.status(429).json({ error: 'Vui lòng đợi 60 giây trước khi xin mã mới' })
    }

    // 4. Rate limit lớp 2 — chống spam 5 mã/ngày
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await sb
        .from('otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('sdt', sdt)
        .gte('created_at', since24h)
    if (countErr) {
        return res.status(500).json({ error: countErr.message })
    }
    if (count >= 5) {
        return res.status(429).json({ error: 'Đã xin quá nhiều mã hôm nay. Thử lại sau 24 giờ.' })
    }

    // 5. Vô hiệu hóa mọi mã cũ chưa dùng của SĐT này
    const { error: invalidateErr } = await sb
        .from('otp_codes')
        .update({ used: true })
        .eq('sdt', sdt)
        .eq('used', false)
    if (invalidateErr) {
        return res.status(500).json({ error: invalidateErr.message })
    }

    // 6. Tạo mã 6 chữ số (không bắt đầu bằng 0)
    const code = String(crypto.randomInt(100000, 1000000))

    // 7. INSERT mã mới
    const expires_at = new Date(now + 5 * 60 * 1000).toISOString()
    const { error: insertErr } = await sb
        .from('otp_codes')
        .insert({ sdt, code, expires_at, used: false, wrong_attempts: 0 })
    if (insertErr) {
        return res.status(500).json({ error: insertErr.message })
    }

    // 8. Gửi SMS (bọc try/catch để không vỡ flow nếu SMS fail)
    try {
        await sendSms(sdt, code)
    } catch (e) {
        console.error('sendSms failed:', e?.message)
    }

    // 9. Thành công — TUYỆT ĐỐI KHÔNG trả code về client
    return res.status(200).json({ ok: true })
}
