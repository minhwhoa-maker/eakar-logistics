import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { user_id, subscription } = req.body
    if (!user_id || !subscription) {
        return res.status(400).json({ error: 'Missing user_id or subscription' })
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const { error } = await sb
        .from('push_subscriptions')
        .upsert({ user_id, subscription }, { onConflict: 'user_id' })

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
}
