import { validateDiem } from '../validate-diem.js'

const MODEL = 'deepseek/deepseek-v3.2'

const SYSTEM_PROMPT = `Đây là đoạn hội thoại/tin nhắn về việc vận chuyển hàng. Tách thành danh sách các ĐIỂM (địa điểm bốc hàng hoặc giao hàng).
Trả về JSON ARRAY THUẦN, mỗi phần tử là 1 object {loai, ten, sdt, dia_chi, ghi_chu}. KHÔNG markdown, KHÔNG \`\`\`, KHÔNG reasoning, KHÔNG giải thích, KHÔNG bọc trong object cha.
loai: "boc" nếu là điểm bốc/lấy hàng, "giao" nếu là điểm giao/trả hàng. Đoán dựa vào ngữ cảnh ("bốc/lấy/gom ở..." → boc; "giao/trả/đến..." → giao). Nghiệp vụ phổ biến: nhiều điểm bốc gom về 1 điểm giao.
Field thiếu → chuỗi rỗng "", KHÔNG bịa.
BỎ QUA mọi link URL (toạ độ xử lý riêng phía client).

Ví dụ 1:
Input: "Lấy hàng chỗ anh Tài 0911222333, kho Ea Kar. Gom thêm 5 thùng chỗ chị Năm 0988777666 chợ Mới. Giao hết lên chỗ anh Bình 0909090909 Sài Gòn."
Output: [{"loai":"boc","ten":"anh Tài","sdt":"0911222333","dia_chi":"kho Ea Kar","ghi_chu":""},{"loai":"boc","ten":"chị Năm","sdt":"0988777666","dia_chi":"chợ Mới","ghi_chu":"5 thùng"},{"loai":"giao","ten":"anh Bình","sdt":"0909090909","dia_chi":"Sài Gòn","ghi_chu":""}]

Ví dụ 2:
Input: "0912345678 lấy máy giặt. Giao số nhà 12 Phạm Văn Đồng 0977665544"
Output: [{"loai":"boc","ten":"","sdt":"0912345678","dia_chi":"","ghi_chu":"máy giặt"},{"loai":"giao","ten":"","sdt":"0977665544","dia_chi":"số nhà 12 Phạm Văn Đồng","ghi_chu":""}]`

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { text } = req.body || {}

    if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'text rỗng' })
    }

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: text }
            ],
            temperature: 0,
            max_tokens: 800,
            stream: false
        })
    })

    if (!upstream.ok) {
        let err
        try {
            err = await upstream.json()
        } catch {
            err = { error: 'Upstream returned non-JSON error' }
        }
        return res.status(upstream.status).json(err)
    }

    const data = await upstream.json()
    let content = data.choices?.[0]?.message?.content

    if (!content) {
        return res.status(502).json({ error: 'parse fail' })
    }

    content = content.replace(/```json|```/g, '').trim()

    let parsed
    try {
        parsed = JSON.parse(content)
    } catch {
        return res.status(502).json({ error: 'parse fail' })
    }

    if (!Array.isArray(parsed)) {
        return res.status(502).json({ error: 'không phải array' })
    }

    const diems = parsed.map(d => {
        const item = (d && typeof d === 'object') ? d : {}
        const loai = item.loai === 'giao' ? 'giao' : 'boc'

        // map LLM snake_case → validator camelCase, rồi validate + sanitize
        const v = validateDiem({
            tenLienHe: item.ten,
            diaChi:    item.dia_chi,
            ghiChu:    item.ghi_chu,
            sdt:       item.sdt,
        })

        return {
            loai,
            ten:     v.data.tenLienHe,
            sdt:     v.data.sdt,
            dia_chi: v.data.diaChi,
            ghi_chu: v.data.ghiChu,
            canhBao: v.canhBao.length > 0 ? v.canhBao : null,
        }
    })

    return res.status(200).json({ diems })
}
