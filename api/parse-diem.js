const MODEL = 'deepseek/deepseek-v3.2'

const SYSTEM_PROMPT = `Bạn là công cụ trích xuất thông tin liên hệ từ tin nhắn Zalo của người gửi hàng.
Nhiệm vụ: tách đúng 4 field sau từ văn bản đầu vào:
- ten: tên người liên hệ (hoặc tên công ty/cửa hàng)
- sdt: số điện thoại (chỉ chữ số, bỏ dấu cách/gạch)
- dia_chi: địa chỉ giao/nhận hàng (đường phố, quận/huyện, tỉnh/thành)
- ghi_chu: ghi chú thêm (hàng hóa, số lượng, yêu cầu đặc biệt, v.v.)

Quy tắc bắt buộc:
1. Trả về JSON THUẦN, một object duy nhất, KHÔNG markdown, KHÔNG \`\`\`, KHÔNG giải thích, KHÔNG reasoning.
2. Field nào không có trong văn bản → trả chuỗi rỗng "", TUYỆT ĐỐI không bịa.
3. BỎ QUA mọi link URL (http://, https://, maps.app.goo.gl, goo.gl, v.v.) — không đưa link vào bất kỳ field nào.
4. Nếu văn bản có nhiều người liên hệ, lấy người đầu tiên được đề cập.

Ví dụ 1:
Input: "Chị Lan 0912345678 - 45 Trần Hưng Đạo Q1 TPHCM - 3 thùng mì gói"
Output: {"ten":"Chị Lan","sdt":"0912345678","dia_chi":"45 Trần Hưng Đạo Q1 TPHCM","ghi_chu":"3 thùng mì gói"}

Ví dụ 2:
Input: "Anh Minh - Công ty ABC\nsdt: 090 888 7766\nĐịa chỉ: 12 Lê Lợi, Buôn Ma Thuột\nhttps://maps.app.goo.gl/abc123\nGiao 5 thùng nước ngọt, để ở cổng"
Output: {"ten":"Anh Minh - Công ty ABC","sdt":"0908887766","dia_chi":"12 Lê Lợi, Buôn Ma Thuột","ghi_chu":"Giao 5 thùng nước ngọt, để ở cổng"}

Ví dụ 3:
Input: "0977111222"
Output: {"ten":"","sdt":"0977111222","dia_chi":"","ghi_chu":""}

Ví dụ 4:
Input: "Kho Ea Kar - lấy hàng sáng sớm"
Output: {"ten":"Kho Ea Kar","sdt":"","dia_chi":"","ghi_chu":"lấy hàng sáng sớm"}`

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { text } = req.body

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
            max_tokens: 300,
            stream: false
        })
    })

    if (!upstream.ok) {
        const err = await upstream.json()
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

    return res.status(200).json({
        ten: parsed.ten || '',
        sdt: parsed.sdt || '',
        dia_chi: parsed.dia_chi || '',
        ghi_chu: parsed.ghi_chu || ''
    })
}
