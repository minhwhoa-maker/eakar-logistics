// route-pricing.js — browser-compatible (no CommonJS)
// Chuẩn hóa "Tuyến" lộn xộn -> mã chuẩn có hướng (DLK-SGN).

// ----------------------------------------------------------------------------
// 0. BỎ DẤU TIẾNG VIỆT
// ----------------------------------------------------------------------------
function boDau(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().trim();
}

// ----------------------------------------------------------------------------
// 1. BẢNG TỈNH
// ----------------------------------------------------------------------------
const TINH = {
  DLK: { ten: 'Đắk Lắk',   alias: ['dak lak', 'daklak', 'dl', 'buon ma thuot', 'bmt', 'ban me', 'ea kar', 'cu mgar', 'krong pac', 'krong pak'] },
  SGN: { ten: 'Sài Gòn',   alias: ['sai gon', 'sg', 'sgn', 'tphcm', 'tp hcm', 'ho chi minh', 'hcm', 'thu duc', 'binh dien', 'binh tan', 'thu dau mot'] },
  GLI: { ten: 'Gia Lai',   alias: ['gia lai', 'gl', 'pleiku', 'an khe', 'ayun pa'] },
  DNO: { ten: 'Đắk Nông',  alias: ['dak nong', 'dno', 'gia nghia', 'dak mil'] },
  KTM: { ten: 'Kon Tum',   alias: ['kon tum', 'ktm', 'kontum'] },
  LDG: { ten: 'Lâm Đồng',  alias: ['lam dong', 'ldg', 'da lat', 'dalat', 'bao loc', 'duc trong'] },
  DNG: { ten: 'Đà Nẵng',   alias: ['da nang', 'dng', 'danang'] },
  KHA: { ten: 'Khánh Hòa', alias: ['khanh hoa', 'kha', 'nha trang', 'cam ranh'] },
  BDH: { ten: 'Bình Định', alias: ['binh dinh', 'bdh', 'quy nhon', 'qui nhon'] },
  PYN: { ten: 'Phú Yên',   alias: ['phu yen', 'pyn', 'tuy hoa', 'song cau'] },
  DNI: { ten: 'Đồng Nai',  alias: ['dong nai', 'dni', 'bien hoa', 'long khanh'] },
  BDG: { ten: 'Bình Dương',alias: ['binh duong', 'bdg', 'di an', 'thuan an'] },
};

const ALIAS_INDEX = [];
for (const [ma, info] of Object.entries(TINH)) {
  for (const a of info.alias) ALIAS_INDEX.push({ ma, alias: boDau(a) });
  ALIAS_INDEX.push({ ma, alias: boDau(info.ten) });
  ALIAS_INDEX.push({ ma, alias: boDau(ma) });
}
ALIAS_INDEX.sort((a, b) => b.alias.length - a.alias.length);

// ----------------------------------------------------------------------------
// 2. TÌM MÃ TỈNH TỪ ĐỊA CHỈ ĐẦY ĐỦ
// ----------------------------------------------------------------------------
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function tinhTuDiaChi(diaChi) {
  const s = boDau(diaChi);
  if (!s) return null;
  let best = null;
  for (const { ma, alias } of ALIAS_INDEX) {
    if (alias.length <= 2) continue; // alias ngắn dễ nhầm trong địa chỉ
    const re = new RegExp('\\b' + _escapeRe(alias) + '\\b');
    const m = s.match(re);
    if (m && (best === null || m.index > best.index)) {
      best = { ma, index: m.index };
    }
  }
  return best ? best.ma : null;
}

// ----------------------------------------------------------------------------
// 3. CHUẨN HÓA 1 TOKEN TỈNH (owner gõ trực tiếp: "Daklak", "ĐL", "SG"...)
// ----------------------------------------------------------------------------
function chuanHoaMaTinh(token) {
  const s = boDau(token);
  if (!s) return null;
  for (const { ma, alias } of ALIAS_INDEX) {
    if (s === alias) return ma;
  }
  return tinhTuDiaChi(token);
}

// ----------------------------------------------------------------------------
// 4. CHUẨN HÓA TUYẾN TỪ CHUỖI TỰ DO ("Daklak - SG", "ĐL đi SGN"...)
// ----------------------------------------------------------------------------
function chuanHoaTuyen(chuoi) {
  const parts = (chuoi || '').split(/\s*(?:-|–|—|→|>|đi|den|đến)\s*/i).filter(Boolean);
  if (parts.length < 2) return { maTuyen: null, canhBao: 'Không tách được 2 đầu tuyến' };
  const o = chuanHoaMaTinh(parts[0]);
  const d = chuanHoaMaTinh(parts[parts.length - 1]);
  return _dungMaTuyen(o, d);
}

// ----------------------------------------------------------------------------
// 5. DERIVE TUYẾN TỪ ĐIỂM BỐC / GIAO
//    diemBoc, diemGiao: mảng object có .diaChi (field .dia_chi khi lấy từ DB)
// ----------------------------------------------------------------------------
function deriveTuyen(diemBoc = [], diemGiao = []) {
  const o = diemBoc.length ? tinhTuDiaChi(diemBoc[0].diaChi) : null;
  const d = diemGiao.length ? tinhTuDiaChi(diemGiao[diemGiao.length - 1].diaChi) : null;
  return _dungMaTuyen(o, d);
}

function _dungMaTuyen(o, d) {
  const canhBao = [];
  if (!o) canhBao.push('Không nhận ra tỉnh điểm bốc');
  if (!d) canhBao.push('Không nhận ra tỉnh điểm giao');
  const maTuyen = `${o || 'XX'}-${d || 'XX'}`;
  const tenTuyen = `${o ? TINH[o].ten : '???'} - ${d ? TINH[d].ten : '???'}`;
  return { maTuyen, tenTuyen, origin: o, dest: d, canhBao: canhBao.length ? canhBao : null };
}
