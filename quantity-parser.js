// quantity-parser.js
// Tách "khối lượng/số kiện" ra khỏi ghi chú tự do cho van-tai-v25
// Logic: bắt số lượng trước -> phần còn lại mới là note

// ----------------------------------------------------------------------------
// 1. ĐƠN VỊ NHẬN DIỆN
// ----------------------------------------------------------------------------
// Thứ tự quan trọng: đơn vị dài/ghép phải đứng TRƯỚC đơn vị ngắn
// (vd "pa-lét" trước "lét", "m3" trước "m") để regex không cắt nhầm.
const DON_VI = [
  'pa-lét', 'pa lét', 'pallet',
  'container', 'cont',
  'thùng', 'thung',
  'kiện', 'kien',
  'tấn', 'tan',
  'tạ', 'ta',
  'kg', 'ký', 'ki lô', 'kilo', 'kilôgam', 'kilogam',
  'bao',
  'khối', 'khoi', 'm3', 'm³',
  'bó', 'bo',
  'cây', 'cay',
  'cuộn', 'cuon',
  'can', 'phuy', 'phi',
  'con', // gia súc/gia cầm
];

// Sắp xếp theo độ dài giảm dần để match đơn vị dài trước
const DON_VI_PATTERN = DON_VI
  .sort((a, b) => b.length - a.length)
  .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // escape ký tự đặc biệt (vd dấu -)
  .join('|');

// Bắt: [số][khoảng trắng tùy chọn][đơn vị]
// - chấp nhận số thập phân kiểu VN: 2,5 hoặc 2.5
// - \b ở cuối tránh dính chữ liền sau (vd "bao" trong "bảo")
const QUANTITY_REGEX = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${DON_VI_PATTERN})\\b`,
  'iu' // i: không phân biệt hoa thường, u: unicode (cho tiếng Việt)
);

// ----------------------------------------------------------------------------
// 2. CHUẨN HÓA ĐƠN VỊ
// ----------------------------------------------------------------------------
// Gom các biến thể về 1 dạng chuẩn để lưu DB cho nhất quán
const DON_VI_CHUAN = {
  'pa-lét': 'pallet', 'pa lét': 'pallet', 'pallet': 'pallet',
  'container': 'cont', 'cont': 'cont',
  'thùng': 'thùng', 'thung': 'thùng',
  'kiện': 'kiện', 'kien': 'kiện',
  'tấn': 'tấn', 'tan': 'tấn',
  'tạ': 'tạ', 'ta': 'tạ',
  'kg': 'kg', 'ký': 'kg', 'ki lô': 'kg', 'kilo': 'kg', 'kilôgam': 'kg', 'kilogam': 'kg',
  'bao': 'bao',
  'khối': 'khối', 'khoi': 'khối', 'm3': 'khối', 'm³': 'khối',
  'bó': 'bó', 'bo': 'bó',
  'cây': 'cây', 'cay': 'cây',
  'cuộn': 'cuộn', 'cuon': 'cuộn',
  'con': 'con', 'can': 'can', 'phuy': 'phuy', 'phi': 'phuy',
};

function chuanHoaDonVi(donVi) {
  return DON_VI_CHUAN[donVi.toLowerCase().trim()] || donVi.toLowerCase().trim();
}

// ----------------------------------------------------------------------------
// 3. HÀM CHÍNH: phân loại 1 dòng
// ----------------------------------------------------------------------------
// Trả về: { isQuantity, raw, soLuong, donVi } hoặc { isQuantity: false }
function classifyLine(line) {
  const text = line.trim();
  if (!text) return { isQuantity: false };

  const match = text.match(QUANTITY_REGEX);

  // CHẶN FALSE POSITIVE:
  // Nếu dòng dài hơn nhiều so với phần match -> nhiều khả năng là câu ghi chú
  // có chứa số (vd "gọi trước 30p, bốc tầm 60 bao nha").
  // Quy tắc: chỉ coi là "thuần số lượng" khi match chiếm phần lớn dòng.
  if (match) {
    const matchLen = match[0].length;
    const ratio = matchLen / text.length;

    // Dòng ngắn gọn kiểu "60 bao", "2,5 tấn" -> ratio cao -> là số lượng
    // Dòng "hàng này để riêng, 60 bao" -> ratio thấp -> để vào note
    // Ngưỡng 0.6 chỉnh được tùy data thực tế
    if (ratio >= 0.6) {
      return {
        isQuantity: true,
        raw: text,
        soLuong: parseFloat(match[1].replace(',', '.')),
        donVi: chuanHoaDonVi(match[2]),
      };
    }
  }

  return { isQuantity: false };
}

// ----------------------------------------------------------------------------
// 4. ÁP DỤNG CHO 1 ĐIỂM (gồm nhiều dòng thừa sau tên/sđt/địa chỉ)
// ----------------------------------------------------------------------------
// Input: mảng các dòng "thừa" (sau khi đã tách tên/sđt/địa chỉ)
// Output: { khoiLuong, ghiChu }
function tachKhoiLuongVaGhiChu(dongThua) {
  let khoiLuong = null;
  const ghiChuLines = [];

  for (const dong of dongThua) {
    const kq = classifyLine(dong);
    if (kq.isQuantity && !khoiLuong) {
      // Lấy dòng số lượng ĐẦU TIÊN bắt được.
      // Nếu 1 điểm có nhiều dòng số lượng (hiếm), dòng sau đẩy xuống note.
      khoiLuong = {
        text: kq.raw,        // "60 bao"  -> hiển thị nguyên cho dễ đọc
        soLuong: kq.soLuong, // 60        -> để cộng tổng / report
        donVi: kq.donVi,     // "bao"     -> để nhóm theo đơn vị
      };
    } else {
      ghiChuLines.push(dong.trim());
    }
  }

  return {
    khoiLuong,                              // null nếu không bắt được
    ghiChu: ghiChuLines.join('. ').trim(),  // gộp phần còn lại
  };
}

// ----------------------------------------------------------------------------
// 5. (OPTIONAL - LÀM SAU) Quy đổi về kg để cộng tổng tải trọng
// ----------------------------------------------------------------------------
// CẢNH BÁO: chỉ chính xác khi biết mặt hàng. "1 bao" cà phê (~60kg) khác
// "1 bao" gạo (~50kg). Đừng bật cái này cho tới khi có bảng quy đổi
// chuẩn theo mặt hàng. Để đây làm khung thôi.
const QUY_DOI_KG = {
  'tấn': 1000,
  'tạ': 100,
  'kg': 1,
  // 'bao': 60,   // <-- nguy hiểm: phụ thuộc mặt hàng, KHÔNG hardcode
};

function quyDoiKg(soLuong, donVi) {
  const heSo = QUY_DOI_KG[donVi];
  if (!heSo) return null; // không quy đổi được -> trả null, đừng đoán bừa
  return soLuong * heSo;
}

// ----------------------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------------------
module.exports = {
  classifyLine,
  tachKhoiLuongVaGhiChu,
  quyDoiKg,
  QUANTITY_REGEX, // export ra để test riêng nếu cần
};

// ----------------------------------------------------------------------------
// VÍ DỤ TEST NHANH (chạy: node quantity-parser.js)
// ----------------------------------------------------------------------------
if (require.main === module) {
  const cases = [
    ['60 bao'],
    ['gọi trước 30p'],
    ['hàng này để riêng đừng đè lên cà phê'],
    ['2,5 tấn', 'gọi trước khi tới'],
    ['bốc tầm 60 bao nha chú'], // câu dài có số -> nên vào note
    ['15 kiện hàng', '500kg', 'để chỗ mát'],
  ];

  cases.forEach((c, i) => {
    console.log(`\n--- Điểm ${i + 1} ---`);
    console.log('Input :', c);
    console.log('Output:', tachKhoiLuongVaGhiChu(c));
  });
}
