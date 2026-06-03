// quantity-parser.js
// Nâng cấp: chuẩn hóa cách nói dân dã ("tấn rưỡi", "1 tấn 8") thành số thập phân,
// và TRÍCH số lượng nằm LẪN trong câu dài (không còn dựa vào ngưỡng ratio nữa).

// ----------------------------------------------------------------------------
// 0. BẢNG QUY ĐỔI THANG TRỌNG LƯỢNG VN (về kg) — mỗi bậc gấp 10
// ----------------------------------------------------------------------------
const KG = {
  'tấn': 1000, 'tan': 1000,
  'tạ': 100, 'ta': 100,
  'yến': 10, 'yen': 10,
  'kg': 1, 'ký': 1, 'cân': 1, 'kilo': 1,
};
// đơn vị nào nằm trong thang trọng lượng (để biết "rưỡi"/"số lẻ" áp dụng được)
const LA_TRONG_LUONG = Object.keys(KG);

// ----------------------------------------------------------------------------
// 1. CHUẨN HÓA SỐ DÂN DÃ  ->  số thập phân + đơn vị
// ----------------------------------------------------------------------------
function chuanHoaSo(text) {
  let s = text;

  // (a) "rưỡi": [N] <unit> rưỡi  ->  (N|1)+0.5 <unit>
  //     "tấn rưỡi"->1.5 tấn | "2 tấn rưỡi"->2.5 tấn | "tạ rưỡi"->1.5 tạ
  //     áp dụng cả đơn vị đếm: "2 bao rưỡi"->2.5 bao
  s = s.replace(
    /(\d+)?\s*(tấn|tan|tạ|ta|yến|yen|kg|ký|cân|kilo|bao|thùng|thung|kiện|kien)\s*rưỡi/giu,
    (m, n, u) => `${(n ? parseInt(n, 10) : 1) + 0.5} ${u}`
  );

  // (b) compound trọng lượng: X (tấn|tạ|yến) Y [đơn vị phụ?]
  //     - có đơn vị phụ rõ  -> tính chính xác qua kg ("1 tạ 8 kg"->1.08 tạ)
  //     - số lẻ trơ (1 chữ số) -> phần thập phân ("1 tấn 8"->1.8 tấn)
  //     - chặn nhầm: nếu sau số lẻ là đơn vị ĐẾM (bao/thùng...) thì BỎ QUA
  s = s.replace(
    /(\d+)\s*(tấn|tan|tạ|ta|yến|yen)\s+(\d+)\s*(tạ|ta|yến|yen|kg|ký|cân|kilo)?(?!\s*(?:bao|thùng|thung|kiện|kien|pa|pallet|cont|cây|bó|cuộn|khối))/giu,
    (m, x, u1, y, u2) => {
      x = parseInt(x, 10);
      y = parseInt(y, 10);
      const k1 = KG[u1.toLowerCase()];
      if (u2) {
        const tongKg = x * k1 + y * KG[u2.toLowerCase()];
        const dec = +(tongKg / k1).toFixed(3); // bỏ số 0 thừa
        return `${dec} ${u1}`;
      }
      // số lẻ trơ: chỉ nhận 1 chữ số = phần thập phân
      if (y >= 1 && y <= 9) return `${x}.${y} ${u1}`;
      return m; // nhiều chữ số -> mơ hồ, để nguyên cho người xem tự xử
    }
  );

  return s;
}

// ----------------------------------------------------------------------------
// 2. CHUẨN HÓA ĐƠN VỊ HIỂN THỊ (gom biến thể về 1 dạng)
// ----------------------------------------------------------------------------
const DON_VI_CHUAN = {
  'tan': 'tấn', 'tấn': 'tấn', 'ta': 'tạ', 'tạ': 'tạ', 'yen': 'yến', 'yến': 'yến',
  'kg': 'kg', 'ký': 'kg', 'cân': 'kg', 'kilo': 'kg',
  'bao': 'bao', 'thung': 'thùng', 'thùng': 'thùng', 'kien': 'kiện', 'kiện': 'kiện',
  'pa-lét': 'pallet', 'pa lét': 'pallet', 'palét': 'pallet', 'pallet': 'pallet',
  'cont': 'cont', 'container': 'cont',
  'khối': 'khối', 'khoi': 'khối', 'm3': 'khối', 'm³': 'khối',
  'bó': 'bó', 'bo': 'bó', 'cây': 'cây', 'cay': 'cây', 'cuộn': 'cuộn', 'cuon': 'cuộn',
};
function chuanHoaDonVi(u) {
  return DON_VI_CHUAN[u.toLowerCase().trim()] || u.toLowerCase().trim();
}

// ----------------------------------------------------------------------------
// 3. REGEX TRÍCH SỐ LƯỢNG (đơn vị hàng hóa — KHÔNG gồm đơn vị thời gian/đếm cuộc)
// ----------------------------------------------------------------------------
const UNIT_RE =
  '(?:tấn|tan|tạ|ta|yến|yen|kg|ký|cân|kilo|bao|thùng|thung|kiện|kien|' +
  'pa-?\\s?lét|palét|pallet|container|cont|khối|khoi|m3|m³|bó|cây|cuộn|cuon)';
const QTY_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b`, 'giu');

// ----------------------------------------------------------------------------
// 4. HÀM CHÍNH: trích khối lượng (nhiều món) + ghi chú còn lại
// ----------------------------------------------------------------------------
// giuNguyenGhiChu = true  -> ghi chú giữ nguyên câu gốc (đọc dễ, nhưng trùng số)
//                  false -> cắt phần số lượng ra khỏi ghi chú (gọn, có thể sót rác)
function tachKhoiLuongVaGhiChu(line, { giuNguyenGhiChu = false } = {}) {
  const goc = line.trim();
  const norm = chuanHoaSo(goc);

  const khoiLuong = [...norm.matchAll(QTY_RE)].map(mt => ({
    text: mt[0].trim(),
    soLuong: parseFloat(mt[1].replace(',', '.')),
    donVi: chuanHoaDonVi(mt[2]),
  }));

  let ghiChu;
  if (giuNguyenGhiChu) {
    ghiChu = goc;
  } else {
    ghiChu = norm
      .replace(QTY_RE, '')                       // bỏ các cụm số lượng
      .replace(/\b(với|và|kèm|gồm|khoảng|chừng|tầm)\b\s*(?=,|$|\s*,)/giu, '') // bỏ liên từ mồ côi
      .replace(/\s*,\s*,+/g, ', ')               // gộp dấu phẩy lặp
      .replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '') // cắt rác đầu/cuối
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return { khoiLuong: khoiLuong.length ? khoiLuong : null, ghiChu };
}

// gộp nhiều dòng thừa của 1 điểm
function xuLyDiem(dongThua, opts) {
  let khoiLuong = [];
  const ghiChuArr = [];
  for (const dong of dongThua) {
    const r = tachKhoiLuongVaGhiChu(dong, opts);
    if (r.khoiLuong) khoiLuong = khoiLuong.concat(r.khoiLuong);
    if (r.ghiChu) ghiChuArr.push(r.ghiChu);
  }
  return {
    khoiLuong: khoiLuong.length ? khoiLuong : null,
    ghiChu: ghiChuArr.join('. ').trim(),
  };
}

module.exports = { chuanHoaSo, tachKhoiLuongVaGhiChu, xuLyDiem, QTY_RE };

// ----------------------------------------------------------------------------
// TEST trên đúng data thật trong screenshot + mấy case bẫy
// ----------------------------------------------------------------------------
if (require.main === module) {
  const cases = [
    '2 tấn rưỡi cà phê, bốc trước 7h sáng',
    '80 bao tiêu, gọi trước 30 phút',
    '15 thùng sầu riêng với 3 pa-lét, hàng dễ bể',
    '500kg hàng khô',
    'giao trước 5h sáng mai, gọi 2 cuộc trước', // KHÔNG được bắt số lượng nào
    '1 tấn 8',                                   // -> 1.8 tấn
    '1 tạ 8 kg',                                 // -> 1.08 tạ
    'tấn rưỡi xi măng',                          // -> 1.5 tấn
    '2 tấn 3 bao',                               // 3 bao là đơn vị đếm -> không gộp vào tấn
  ];
  for (const c of cases) {
    console.log('\nIN :', c);
    console.log('OUT:', JSON.stringify(tachKhoiLuongVaGhiChu(c)));
  }
}
