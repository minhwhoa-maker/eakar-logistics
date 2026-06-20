const MODEL = 'deepseek/deepseek-v3.2'

const LOAI_ENUM = ['sua', 'thay_moi']

const PARTS_BY_NHOM = {
    'Phanh':   ['Má phanh trước', 'Má phanh sau', 'Đĩa phanh'],
    'Lốp':     ['Lốp trước trái', 'Lốp trước phải', 'Lốp sau trái', 'Lốp sau phải'],
    'Động cơ': ['Nhớt động cơ', 'Lọc dầu', 'Lọc gió', 'Lọc nhiên liệu', 'Bugi', 'Dây curoa'],
    'Điện':    ['Ắc quy', 'Đèn pha', 'Đèn hậu'],
    'Khác':    ['Gương chiếu hậu', 'Thay dầu hộp số', 'Bảo dưỡng điều hòa']
}
const NHOM_ENUM = ['Phanh', 'Lốp', 'Động cơ', 'Điện', 'Khác']

const PARTS_LIST = Object.entries(PARTS_BY_NHOM)
    .map(([nhom, arr]) => `${nhom}: ${arr.join(', ')}`)
    .join('\n')

const SYSTEM_PROMPT = `Bạn là công cụ phân loại mô tả bảo dưỡng xe tải của tài xế.
Nhiệm vụ: từ mô tả tiếng Việt, trả về JSON với 3 field: loai, nhom, bo_phan.

loai = HÀNH ĐỘNG, PHẢI thuộc đúng 1 trong 2 giá trị (không dùng giá trị khác):
- sua: vá/chỉnh/khắc phục cái đang có (vá lốp, chỉnh phanh, sửa máy kêu...)
- thay_moi: thay mới/lắp mới phụ tùng (thay lốp, thay nhớt, lắp ắc quy mới...)
Mơ hồ, không rõ sửa hay thay → "".

nhom = nhóm bộ phận, PHẢI thuộc đúng 1 trong 5 giá trị (in NGUYÊN VĂN, đúng dấu, đúng hoa thường):
${NHOM_ENUM.join(', ')}.
Suy từ bộ phận được nhắc. Không chắc → "".

bo_phan = tên bộ phận. Ưu tiên khớp ĐÚNG 1 mục trong danh sách của nhóm đoán được:
${PARTS_LIST}
Nếu không khớp, trả tên ngắn gọn tự rút từ mô tả. TUYỆT ĐỐI không bịa. Thiếu → "".

Quy tắc bắt buộc:
1. Trả về JSON THUẦN, một object duy nhất, KHÔNG markdown, KHÔNG \`\`\`, KHÔNG giải thích.
2. Không chắc/thiếu thông tin → trả chuỗi rỗng "", không đoán liều.

Ví dụ 1:
Input: "thay lốp sau phải"
Output: {"loai":"thay_moi","nhom":"Lốp","bo_phan":"Lốp sau phải"}

Ví dụ 2:
Input: "vá lốp trước trái"
Output: {"loai":"sua","nhom":"Lốp","bo_phan":"Lốp trước trái"}

Ví dụ 3:
Input: "thay nhớt với lọc dầu"
Output: {"loai":"thay_moi","nhom":"Động cơ","bo_phan":"Nhớt động cơ"}

Ví dụ 4:
Input: "máy kêu lạ chưa rõ"
Output: {"loai":"","nhom":"Động cơ","bo_phan":""}`

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

    let nhom = typeof parsed.nhom === 'string' ? parsed.nhom : ''
    if (!NHOM_ENUM.includes(nhom)) nhom = ''

    let bo_phan = String(parsed.bo_phan ?? '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 100)

    return res.status(200).json({ loai, nhom, bo_phan })
}
