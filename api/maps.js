export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end()

    const { origin, destination, waypoints = [] } = req.body

    const encode = (s) => encodeURIComponent(s)
    const toParam = (d) => d.lat && d.lng ? `${d.lat},${d.lng}` : d.dia_chi

    const originParam = encode(toParam(origin))
    const destParam = encode(toParam(destination))

    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originParam}&destination=${destParam}&key=${process.env.GOOGLE_MAPS_API_KEY}`

    if (waypoints.length > 0) {
        const waypointStr = 'optimize:true|' + waypoints.map(w => toParam(w)).join('|')
        url += `&waypoints=${encode(waypointStr)}`
    }

    try {
        const response = await fetch(url)
        const data = await response.json()

        if (data.status !== 'OK') {
            return res.status(200).json({ error: data.status + ': ' + (data.error_message || 'Google Maps error') })
        }

        const route = data.routes[0]
        const km = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000
        const optimized_order = route.waypoint_order || []

        return res.status(200).json({ km, optimized_order })
    } catch (err) {
        return res.status(200).json({ error: err.message })
    }
}
