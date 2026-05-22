export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end()

    const { origin, destination, waypoints = [] } = req.body

    const toWaypoint = (d) => d.lat && d.lng
        ? { location: { latLng: { latitude: d.lat, longitude: d.lng } } }
        : { address: d.dia_chi }

    const body = {
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        ...(waypoints.length > 0 && { optimizeWaypointOrder: true })
    }

    if (waypoints.length > 0) {
        body.intermediates = waypoints.map(toWaypoint)
    }

    try {
        const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
                'X-Goog-FieldMask': 'routes.distanceMeters,routes.optimizedIntermediateWaypointIndex'
            },
            body: JSON.stringify(body)
        })
        const data = await response.json()

        if (!data.routes || data.routes.length === 0) {
            return res.status(200).json({ error: data.error?.message || 'No routes found' })
        }

        const route = data.routes[0]
        const km = route.distanceMeters / 1000
        const optimized_order = route.optimizedIntermediateWaypointIndex || []

        return res.status(200).json({ km, optimized_order })
    } catch (err) {
        return res.status(200).json({ error: err.message })
    }
}
