const MODEL = 'deepseek/deepseek-v3.2'

const LOAI_ENUM = ['hong_hoc', 'linh_kien', 'lop_xe', 'dinh_ky']

const PRESET_PARTS = [
    'Lốp trước trái', 'Lốp trước phải', 'Lốp sau trái', 'Lốp sau phải',
    'Nhớt động cơ', 'Lọc dầu', 'Lọc gió', 'Lọc nhiên liệu',
    'Má phanh trước', 'Má phanh sau', 'Đĩa phanh',
    'Ắc quy', 'Bugi', 'Dây curoa',
    'Đèn pha', 'Đèn hậu', 'Gương chiếu hậu',
    'Thay dầu hộp số', 'Bảo dưỡng điều hòa', 'Đăng kiểm', 'Bảo hiểm'
]

const SYSTEM_PROMPT = `Bạn là công cụ phân loại mô tả bảo dưỡng xe tải của tài xế.
Nhiệm vụ: từ mô tả tiếng Việt, trả về JSON với 2 field: loai và bo_phan.

loai PHẢI thuộc đúng 1 trong 4 giá trị sau (không được dùng giá trị khác):
- lop_xe: liên quan đến lốp/vỏ xe (thay lốp, vá lốp, mòn lốp, nổ lốp...)
- linh_kien: thay thế phụ tùng/vật tư (nhớt, lọc dầu, lọc gió, má phanh, ắc quy, bugi, dây curoa, bóng đèn...)
- hong_hoc: hỏng hóc/sự cố bất thường (máy kêu lạ, chảy dầu, bơm nước hỏng, mất phanh...)
- dinh_ky: bảo dưỡng định kỳ, đăng kiểm, bảo hiểm

bo_phan: tên bộ phận. Ưu tiên khớp ĐÚNG 1 trong danh sách chuẩn sau:
${PRESET_PARTS.join(', ')}.
Nếu không khớp được danh sách trên, trả tên ngắn gọn tự rút từ mô tả. TUYỆT ĐỐI không bịa.

Quy tắc bắt buộc:
1. Trả về JSON THUẦN, một object duy nhất, KHÔNG markdown, KHÔNG \`\`\`, KHÔNG giải thích.
2. Không chắc/thiếu thông tin → trả chuỗi rỗng "", không đoán liều.

Ví dụ 1:
Input: "lốp sau phải mòn quá thay luôn"
Output: {"loai":"lop_xe","bo_phan":"Lốp sau phải"}

Ví dụ 2:
Input: "thay nhớt máy với lọc dầu"
Output: {"loai":"linh_kien","bo_phan":"Nhớt động cơ"}

Ví dụ 3:
Input: "đến hạn đăng kiểm"
Output: {"loai":"dinh_ky","bo_phan":"Đăng kiểm"}

Ví dụ 4:
Input: "máy kêu lạ, bơm nước hỏng"
Output: {"loai":"hong_hoc","bo_phan":""}`

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
            max_tokens: 200,
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

    // Validate server-side — KHÔNG tin LLM
    let loai = typeof parsed.loai === 'string' ? parsed.loai : ''
    if (!LOAI_ENUM.includes(loai)) loai = ''

    let bo_phan = String(parsed.bo_phan ?? '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 100)

    return res.status(200).json({ loai, bo_phan })
}
