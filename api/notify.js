import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
)

const NOTIFY_CONTENT = {
    new_trip: (p) => ({
        title: '🚛 Chuyến mới bắt đầu',
        body: `[${p.bien_so}] ${p.driver_name} — ${p.tuyen_duong}`
    }),
    complete: (p) => ({
        title: '✅ Chuyến hoàn thành',
        body: `[${p.bien_so}] ${p.driver_name} — ${p.tuyen_duong}`
    }),
    expense: (p) => ({
        title: '💰 Chi phí mới',
        body: `${p.driver_name} [${p.bien_so}] thêm ${p.loai}: ${p.so_tien}`
    })
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { owner_id, type, payload } = req.body
    if (!owner_id || !type || !payload || !NOTIFY_CONTENT[type]) {
        return res.status(400).json({ error: 'Missing or invalid owner_id / type / payload' })
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Check notify settings — skip if owner turned off this type
    const { data: settings } = await sb
        .from('notify_settings')
        .select('notify_new_trip, notify_complete, notify_expense')
        .eq('user_id', owner_id)
        .single()

    if (settings && settings[`notify_${type}`] === false) {
        return res.status(200).json({ skipped: true })
    }

    // Get push subscription for this owner
    const { data: sub, error: subErr } = await sb
        .from('push_subscriptions')
        .select('subscription_json')
        .eq('user_id', owner_id)
        .single()

    if (subErr || !sub) {
        return res.status(200).json({ no_subscription: true })
    }

    const { title, body } = NOTIFY_CONTENT[type](payload)
    const url = payload.trip_id ? '/trip-detail.html?id=' + payload.trip_id : '/owner-dashboard.html'
    const pushPayload = JSON.stringify({
        title,
        body,
        icon: '/icons/icon-192.png',
        url
    })

    try {
        await webpush.sendNotification(sub.subscription_json, pushPayload)
        return res.status(200).json({ ok: true })
    } catch (e) {
        if (e.statusCode === 410) {
            await sb.from('push_subscriptions').delete().eq('user_id', owner_id)
            return res.status(200).json({ expired: true })
        }
        return res.status(500).json({ error: e.message })
    }
}
