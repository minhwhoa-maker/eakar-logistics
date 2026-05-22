async function geocode(apikey, point, focusLat, focusLng) {
    // Early return nếu đã có tọa độ
    if (point.lat != null && point.lng != null) {
        return { lat: point.lat, lng: point.lng }
    }

    let url = `https://maps.vietmap.vn/api/search/v3?apikey=${apikey}&text=${encodeURIComponent(point.dia_chi)}`
    if (focusLat != null && focusLng != null) {
        url += `&focus=${focusLat},${focusLng}`
    }

    const httpRes = await fetch(url)
    const data = await httpRes.json()

    if (!data.data || data.data.length === 0) {
        throw new Error('Không tìm được địa chỉ: ' + point.dia_chi)
    }
    return { lat: data.data[0].lat, lng: data.data[0].lng }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end()

    try {
        const { origin, destination, waypoints = [] } = req.body
        const apikey = process.env.VIETMAP_API_KEY

        const originGeo = await geocode(apikey, origin)

        const otherGeos = await Promise.all(
            [...waypoints, destination].map(p => geocode(apikey, p, originGeo.lat, originGeo.lng))
        )
        const waypointGeos = otherGeos.slice(0, waypoints.length)
        const destinationGeo = otherGeos[otherGeos.length - 1]

        if (waypoints.length === 0) {
            const routeUrl = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${apikey}` +
                `&point=${originGeo.lat},${originGeo.lng}&point=${destinationGeo.lat},${destinationGeo.lng}` +
                `&vehicle=car&points_encoded=false`
            const routeRes = await fetch(routeUrl)
            const routeData = await routeRes.json()

            if (!routeData.paths || routeData.paths.length === 0) {
                return res.status(200).json({ error: 'VietMap không tìm được tuyến đường' })
            }
            if (routeData.paths[0].distance == null) {
                return res.status(200).json({ error: 'VietMap trả về distance không hợp lệ' })
            }

            // km rounded to 1 decimal, intentional for bang_luong_km lookup
            const km = Math.round(routeData.paths[0].distance / 1000 * 10) / 10
            return res.status(200).json({ km, optimized_order: [] })
        } else {
            const allPoints = [originGeo, ...waypointGeos, destinationGeo]
            const pointParams = allPoints.map(p => `point=${p.lat},${p.lng}`).join('&')
            const tspUrl = `https://maps.vietmap.vn/api/tsp/v3?apikey=${apikey}&${pointParams}` +
                `&vehicle=car&roundtrip=false&sources=first&destinations=last&points_encoded=false`
            const tspRes = await fetch(tspUrl)
            const tspData = await tspRes.json()

            if (!tspData.paths || tspData.paths.length === 0) {
                return res.status(200).json({ error: 'VietMap không tìm được tuyến đường' })
            }
            if (tspData.paths[0].distance == null) {
                return res.status(200).json({ error: 'VietMap trả về distance không hợp lệ' })
            }

            // km rounded to 1 decimal, intentional for bang_luong_km lookup
            const km = Math.round(tspData.paths[0].distance / 1000 * 10) / 10
            // TODO: VietMap TSP không trả index order, fallback to original order
            const optimized_order = waypoints.map((_, i) => i)
            return res.status(200).json({ km, optimized_order })
        }
    } catch (e) {
        console.error(e)
        return res.status(200).json({ error: e.message })
    }
}
