import { createClient } from '@supabase/supabase-js'

async function resolveOwner(req) {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return null
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data: { user }, error } = await sb.auth.getUser(token)
    if (error || !user) return null
    const { data: profile } = await sb.from('users').select('id, role').eq('email', user.email).maybeSingle()
    if (!profile || profile.role !== 'owner') return null
    return { ownerId: profile.id, sb }
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const auth = await resolveOwner(req)
        if (!auth) return res.status(401).json({ ok: false })
        const { ownerId, sb } = auth

        const { maTuyen } = req.query
        if (typeof maTuyen !== 'string' || !maTuyen.trim()) return res.status(400).json({ ok: false, msg: 'missing maTuyen' })
        const maTuyenClean = maTuyen.trim()
        if (maTuyenClean.includes('XX')) return res.status(400).json({ ok: false, msg: 'tuyen khong hop le' })

        const { data: row } = await sb
            .from('route_salary')
            .select('luong_tai_xe')
            .eq('owner_id', ownerId)
            .eq('ma_tuyen', maTuyenClean)
            .maybeSingle()

        return res.json({ luongTaiXe: row?.luong_tai_xe ?? null })
    }

    if (req.method === 'POST') {
        const auth = await resolveOwner(req)
        if (!auth) return res.status(401).json({ ok: false })
        const { ownerId, sb } = auth

        const { maTuyen, luongTaiXe } = req.body
        if (typeof maTuyen !== 'string' || !maTuyen.trim() || maTuyen.trim().includes('XX')) {
            return res.status(400).json({ ok: false, msg: 'tuyen khong hop le' })
        }
        const maTuyenClean = maTuyen.trim()
        const luong = Number(luongTaiXe)
        if (!Number.isInteger(luong) || luong <= 0 || luong > 100_000_000) {
            return res.status(400).json({ ok: false, msg: 'luong khong hop le' })
        }

        const { error } = await sb.from('route_salary').upsert(
            { owner_id: ownerId, ma_tuyen: maTuyenClean, luong_tai_xe: luong, updated_at: new Date().toISOString() },
            { onConflict: 'owner_id,ma_tuyen' }
        )
        if (error) {
            console.error(error)
            return res.status(500).json({ ok: false, msg: 'db error' })
        }

        return res.json({ ok: true })
    }

    return res.status(405).json({ ok: false })
}
