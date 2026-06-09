# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fleet management app cho công ty vận tải Ea Kar — owner theo dõi chuyến/doanh thu/lương, driver nhập chuyến và upload ảnh hóa đơn. Khởi nguồn là dự án học code (`bai*`); các bài tập cũ `bai1-9.html` đã xóa, chỉ còn `bai10.html` là landing/auth thực tế. App chạy trên `bai10.html` + 8 trang admin/driver: `owner-dashboard.html`, `driver.html`, `vehicles.html`, `luong-thang.html`, `luong-cua-toi.html`, `driver-page.html`, `trip-detail.html`, `supervisors.html`.

- Stack: Vanilla HTML/CSS/JS + Supabase (Postgres + Auth + Storage + Realtime) + Vercel
- Live: https://eakar-logistics.vercel.app
- Supabase project ref: `icwmtqfpbefntfxboofr`
- Anon key (public, đã có trong `shared.js`):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljd210cWZwYmVmbnRmeGJvb2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Mzg3NzgsImV4cCI6MjA5MjUxNDc3OH0.N1gsPt4eZav2LL2XDttqlsAB06b1UzXb4bFTMi3K8NM
  ```

## Commands

Không có build step, không có test runner, không có lint. Quy trình:

- **Edit**: sửa file `.html`/`.css`/`.js` trực tiếp.
- **Test utility scripts**: `node quantity-parser.js` (chạy self-test ở cuối file — CommonJS, chưa wire vào app).
- **Preview local**: mở file qua `file://` (đa số chạy được), hoặc `python -m http.server` để tránh lỗi service worker / relative path.
- **Deploy**: `git push origin main` → Vercel auto-deploy.
- **DB schema changes**: vào Supabase dashboard project `icwmtqfpbefntfxboofr` chỉnh tay (SQL editor hoặc Table editor).
- **api/ dependencies**: `npm install` cài `web-push` + `@supabase/supabase-js` cho Vercel serverless functions. Không cần chạy lại khi chỉ sửa HTML/CSS/JS frontend.
- **Line endings**: repo dùng **CRLF** (Windows). Khi append/overwrite file qua tool tự động, giữ nguyên CRLF; mixed-EOL trong cùng file gây git diff noise toàn file.
- **Test OTP trong dev**: Khi `ZALO_ACCESS_TOKEN` chưa set → `api/send-otp.js` log `[DEV] OTP: <code>` ra **Vercel function logs**. Trigger send từ `login-sdt.html`, mở Vercel dashboard → Logs → tìm log của `send-otp` để đọc mã 6 số rồi nhập step 2.

## Architecture

> **Quy tắc nạp context**: file này = convention chung + schema + shared/route-pricing/validate-diem + CSS + auth + env table. Chi tiết tách ra 2 file con. CLAUDE.md MỘT MÌNH CHƯA ĐỦ để sửa một trang/endpoint cụ thể:
> - Task đụng 1 trang HTML → đọc `docs/pages.md` trước.
> - Task đụng 1 endpoint `api/` → đọc `docs/api.md` trước.
> - Không đọc file con tương ứng = spec-từ-trí-nhớ (CẤM).

### Page roles

> **Chi tiết hành vi từng trang đã tách ra `docs/pages.md`** (bai10, login-sdt, owner-dashboard, trip-detail, driver-page, driver, vehicles, luong-thang, luong-cua-toi, supervisors, sw.js/manifest). Đọc file đó khi cần sửa một trang cụ thể.

### route-pricing.js (browser-compatible, load qua `<script src="route-pricing.js">`)

Chỉ dùng trong `owner-dashboard.html`. KHÔNG có `module.exports`/`require`.

```
boDau(s)                → bỏ dấu tiếng Việt + lowercase (dùng để so khớp alias)
tinhTuDiaChi(diaChi)    → mã tỉnh (vd 'DLK') từ địa chỉ đầy đủ, match alias cuối chuỗi
chuanHoaMaTinh(token)   → mã tỉnh từ token đơn ("Daklak", "ĐL", "SG"...)
chuanHoaTuyen(chuoi)    → { maTuyen, tenTuyen, origin, dest, canhBao } từ chuỗi tự do ("ĐL-SG")
deriveTuyen(diemBoc[], diemGiao[]) → same shape; derive từ diemBoc[0].diaChi + diemGiao[last].diaChi
```

- `TINH`: map mã → tên + alias (12 tỉnh: DLK, SGN, GLI, DNO, KTM, LDG, DNG, KHA, BDH, PYN, DNI, BDG)
- `ALIAS_INDEX`: pre-built sorted array alias → mã (dài trước ngắn, tránh nhầm)
- `maTuyen` chứa `'XX'` khi không nhận ra tỉnh — caller phải guard trước khi lưu DB
- Thêm tỉnh mới: thêm vào `TINH` object là đủ, `ALIAS_INDEX` tự build khi load

### validate-diem.js (ESM — import bởi `api/parse-hoi-thoai.js`)

Tầng validate CỨNG chạy server-side sau khi LLM parse hội thoại. Không dùng ở browser.

```
validateSDT(raw)       → { ok, value, reason } — chuẩn hóa +84→0, chặn rác (toàn 1 số,
                          dãy liên tiếp, đầu số không hợp lệ), trả value là 0xxxxxxxxx
sanitizeText(raw, max) → strip control char, gộp whitespace, cap độ dài
validateDiem(parsed)   → { ok, canhBao[], data: {tenLienHe, sdt, diaChi, ghiChu} }
                          nhận camelCase; field lạ (luong, xe...) bị bỏ qua hoàn toàn
```

- `DAU_SO_HOP_LE`: Set 3-ký-tự prefix hợp lệ (Viettel/Mobifone/Vinaphone/Vietnamobile/Gmobile/Itelecom). Tự cập nhật khi nhà mạng được cấp thêm đầu số.
- **Field mapping**: LLM trả snake_case (`ten`, `dia_chi`, `ghi_chu`) → caller map sang camelCase trước khi gọi `validateDiem`, rồi map lại snake_case sau. Xem `api/parse-hoi-thoai.js` để reference.
- `canhBao` là mảng string rỗng nếu hợp lệ. SĐT sai → `data.sdt = ''` (owner gõ lại), nhưng `canhBao` vẫn có để hiển thị.
- Client (`fillLastRow`) đọc `canhBao` từ API response và render badge cam `⚠️` dưới row — KHÔNG re-validate ở browser.

### shared.js (BẮT BUỘC dùng cho mọi page mới)
```
createSb()              → tạo Supabase client với URL+anon key built-in
formatBienSo(s)         → chuẩn hóa biển số thành dạng "XX-NNN.NN" (uppercase, strip separators)
formatMoney(n)          → "1.234.567 đ" (vi-VN locale + đ ký tự)
formatDate(timestamptz) → "HH:MM - DD/MM/YY" (nhận ISO string hoặc timestamptz từ Supabase)
getUserRole(sb, email)  → role string hoặc null
getUserProfile(sb, email) → { id, role, owner_id } hoặc null
requireRole(sb, role)   → đảm bảo session + role khớp; redirect bai10 nếu không. Hỗ trợ 2 auth: Supabase session (OAuth) HOẶC driver_token (Zalo) verify qua POST /api/verify-session.
                          Nhận string (cũ) hoặc array (mới): `requireRole(sb, ['owner', 'supervisor'])`.
                          Trả { user, profile } hoặc null.
setupLogoutListener(sb) → tự redirect bai10 khi logout từ tab khác. Early-return nếu có driver_token (Zalo user KHÔNG đăng ký onAuthStateChange — tránh bị văng khi cold start không có Supabase session).
getLocation()           → Promise<{ lat, lng }> — dùng Geolocation API, timeout 10s.
                          Reject với Error nếu thiết bị không hỗ trợ hoặc user từ chối GPS.
```

Mỗi page admin (driver/vehicles/owner-dashboard) bắt đầu với:
```js
const sb = createSb()
async function initPage() {
    // single role: requireRole(sb, 'owner') hoặc requireRole(sb, 'driver')
    // multi-role (Phase A supervisor đọc page owner): truyền array
    const auth = await requireRole(sb, ['owner', 'supervisor'])
    if (!auth) return
    const profile = auth.profile
    const effectiveOwnerId = profile.role === 'supervisor' ? profile.owner_id : profile.id
    if (profile.role === 'owner') document.body.classList.add('role-owner')
    // ... load data với .eq('owner_id', effectiveOwnerId)
}
setupLogoutListener(sb)
initPage()
```

Một số page khai `let currentRole = null` (module-level), gán `currentRole = auth.profile.role` ngay sau `requireRole()`. Hiện cả 4 page owner đều có, nhưng chỉ `vehicles.html` thực sự dùng nó cho runtime branching (conditional cell render — supervisor vs owner). 3 page kia chỉ dùng để gate `body.role-owner`, tương đương `if (auth.profile.role === 'owner')` inline — biến là dead-weight do copy-paste, không bắt buộc. Page mới: chỉ khai khi cần branching ngoài tầm với của CSS `.owner-only`.

### Số dư tạm ứng (Phase 2)

`calcDriverBalance(sb, ownerId, driverId)` → `{ balance, breakdown }` — helper **được duplicate local** vào driver-page.html, driver.html, luong-cua-toi.html (không phải shared.js). Công thức:

```
balance = tam_ung_trips + tam_ung_thang_total - hoan_ung_trips - chi_phi_driver_paid
```

- `tam_ung_trips` / `hoan_ung_trips`: chỉ từ trips `trang_thai='hoan_thanh'`
- `tam_ung_thang_total`: all-time, không filter tháng
- `chi_phi_driver_paid`: từ **ALL trips** (active + hoàn thành), `nguon_tien='driver_paid'`, `is_legacy=false`
- Entries `nguon_tien=NULL` (legacy) bị bỏ qua hoàn toàn

**Workaround Supabase nested filter**: KHÔNG dùng `.eq('trip.owner_id', ...)` vì alias không work. Thay bằng 2-step: query allTripIds trước, rồi `.in('trip_id', allTripIds)`.

**Applied migration** (đã apply; giữ lại để tham khảo schema history):
```sql
ALTER TABLE chi_phi_chuyen ADD COLUMN IF NOT EXISTS nguon_tien text;
ALTER TABLE chi_phi_chuyen ADD CONSTRAINT chi_phi_chuyen_nguon_tien_check
  CHECK (nguon_tien IS NULL OR nguon_tien IN ('driver_paid', 'owner_paid'));
```

### Auth flow & 2 ID schemes (gotcha quan trọng)
`users.id` có thể có 2 origin khác nhau:
- (a) **Auth UUID**: khi owner INSERT driver thủ công qua `bai10` flow cũ (đã bỏ) — không còn dùng.
- (b) **DB-generated UUID**: khi owner tạo trước qua `driver.html addDriver` (không set id, để DB auto-gen).

Khi user case (b) login lần đầu, bai10 thấy email đã có → skip insert → `users.id` ≠ Auth UUID. Vì vậy **mọi reference trong app phải dùng `users.id` (qua `currentProfileId`), KHÔNG dùng `currentUser.id` (Auth UUID)**:
- `trips.tai_xe_id` → `currentProfileId`
- Storage path receipts → `${currentProfileId}/{timestamp}.{ext}`

`currentUser.id` (Auth UUID) chỉ dùng cho session check, không leak vào DB.

### CSS conventions
- CSS variables ở `:root` của `style.css`: `--primary #1565c0`, `--danger #e74c3c`, `--success #2e9e58`, `--warning #e08e2b`, `--bg #f0f2f5`, `--white #ffffff`, `--border #e8eaed`, `--text #3a3f47`, `--text-muted #8a9099`, `--shadow` (2 lớp: `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)`), `--radius 12px`, `--radius-sm 8px`. **`--card-bg` và `--bg-secondary` KHÔNG tồn tại** — dùng `--white` và `--bg` thay thế.
- Button classes: `.btn` (xanh primary), `.btn-danger/.btn-success/.btn-warning/.btn-purple/.btn-gray/.btn-logout/.btn-full/.btn-sm`. **Không dùng inline `style="background:..."`** — đã có class.
- `.form-group input` được style sẵn. `.form-group select` **không** được style — cần inline style: `width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:15px;color:#1a1a2e;background:white`.
- `#receipt-preview` và `#receipt-preview img` được style bằng **ID selector** trong `style.css` — không áp dụng cho dynamic forms. Khi tạo preview image động phải thêm inline style.
- Stat values trong owner-dashboard: `.stat-value.green/red/blue/orange`.
- Bảng nhiều cột bọc trong `<div class="table-scroll wide">` để mobile scroll ngang. Trên desktop ≥1200px, min-width không áp dụng (chỉ active ở ≤1199px) nên bảng tự fit theo container.
- `.container` responsive tiers: `max-width: 900px` (default) → `1400px` (≥1200px) → `1600px` (≥1600px). Không dùng `max-width: 900px` hardcode cho page-level elements vì sẽ break trên desktop rộng.
- Toggle switch notify settings: `.notify-row` (flex row), `.toggle` (label wrapper), `.toggle-slider` (pseudo-element track/thumb). Checked state: `--success` green. Đã có trong `style.css`.
- **Modal scroll-lock**: `.modal-open { overflow: hidden }` trong `style.css`. Mọi overlay modal thật (fixed inset full-screen + backdrop) phải `document.body.classList.add('modal-open')` khi mở và `.remove('modal-open')` khi đóng. **KHÔNG** áp dụng cho: `notify-panel`, inline form (`openForm`/`closeActiveForm`), element con bên trong modal. Khi chuyển giữa 2 modal liên tiếp (ví dụ `new-trip-modal` → `preview-trip-modal`), chỉ add khi mở cái mới, không remove ở giữa.
- All asset links dùng **relative path** (`manifest.json`, `style.css`, `sw.js`, `shared.js`) — không có leading `/`.
- **Header layout — 3-zone pattern** (tất cả 5 trang admin/driver): `.header` là `display:flex; justify-content:space-between` (đã có trong style.css). Cấu trúc 3 zone:
  - **left-zone** `<div style="display:flex; align-items:center; gap:8px;">`: chứa `hamburger-btn` + (nếu có trang quay lại) `<div class="header-nav-desktop">← Trang chủ</div>`
  - **h2** `style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%)"`: tách khỏi flex flow, căn giữa thật sự. `position:sticky` của `.header` (style.css) là containing block — **không cần thêm `position:relative`**
  - **right-zone** `<div style="display:flex; align-items:center; gap:8px;">`: dùng **dual `header-nav-desktop` wrapper**: `[header-nav-desktop: nav/action buttons]` + `[🔔 btn-notify standalone]` + `[header-nav-desktop: Đăng xuất]`. Pages không có nav buttons bỏ wrapper đầu; pages không có 🔔 bỏ luôn phần đó.
  - Mobile (≤600px): `header-nav-desktop` ẩn (`display:none !important`), chỉ hamburger-btn và 🔔 hiện. `.header-text` trong h2 cũng ẩn — chỉ emoji hiện. `style.css` có `@media (max-width:600px)` override padding/font-size cho `.header`, `.header h2`, `.header > div` — **không cần thêm local `<style>` block** trong từng page cho mobile header.
- **Role-gating pattern** (supervisor/owner): `.owner-only { display:none !important }` mặc định trong style.css; `body.role-owner .owner-only { display:revert !important }` gỡ ẩn cho owner. JS thêm `document.body.classList.add('role-owner')` ngay sau khi gán `currentRole`, trước mọi render. `.supervisor-only` là ngược lại: hiện mặc định, ẩn khi `body.role-owner`. Feature gating theo role mới dùng pattern này, KHÔNG dùng `style.display='none'` trong JS.
- **`display: revert` gotcha**: `revert` rollback PAST mọi author rule về **UA default** của element. `<a>`/`<span>` UA default là `inline`, `<div>` là `block`. Vậy nên `.hamburger-menu a { display: block }` (author rule) bị `revert` xóa → element thành `inline` → vỡ layout menu. Bất cứ khi nào dùng `revert` để gỡ ẩn `.owner-only`, nếu element nằm trong container có rule `display: block`/`flex`/etc thì phải scope lại: `body.role-owner .hamburger-menu .owner-only { display: block !important }`. Specificity (0,3,1) thắng (0,2,1). Buttons (`.btn` là `inline-flex`) thường OK vì single text-node child → flex chỉ thoái về `inline-block` không vỡ visual.

### Notification pattern (showToast)
Tất cả page admin/driver dùng `showToast()` cho user feedback. Mỗi file tự định nghĩa hàm này ở đầu `<script>` (không phải trong `shared.js`) và cần `<div class="toast" id="toast"></div>` trước `</body>`:

```js
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.className = 'toast', 3000);
}
```

- Error → `showToast('...', 'error')`, success → `showToast('...', 'success')`, neutral → `showToast('...')`
- **Ngoại lệ**: `owner-dashboard.html` dùng thêm `showStatus()` (`.message.success/.error/.empty`) cho status area tĩnh trong table container; `driver.html` dùng `#add-msg` element riêng cho "Thêm tài xế thành công" (không phải toast).

### api/ — Vercel serverless functions

> **Chi tiết từng endpoint (request/response shape, flow, schema liên quan) đã tách ra `docs/api.md`**: `chat`, `maps`, `subscribe`, `notify`, `send-otp`, `verify-otp`, `verify-session`, `route-salary`, `parse-diem`, `parse-hoi-thoai`, `phan-loai-bao-duong`. Đọc file đó khi cần sửa một endpoint cụ thể.

Tất cả dùng ESM (`import`/`export default`). `package.json` khai báo `"type": "module"`. Bảng env variables tổng hợp ngay dưới.

### Zalo OA / ZNS — vận hành

OA EA KAR Logistics (ID 3147741945922067881), App ID 32803479737513325, ZBS Account đã liên kết + nạp tiền.
Template OTP 586307 đã duyệt. Gửi ZNS qua API yêu cầu OA có gói trả phí (Cơ bản miễn phí KHÔNG có quyền → lỗi OA does not have permission).
Hiện dùng gói Dùng thử (10k, hết hạn 29/06/2026, không gia hạn được). Production phải lên Nâng cao 99k/tháng (gói rẻ nhất có ZBS Template Message API + gia hạn được).
OTP về Zalo không có push notification nếu người nhận chưa "Quan tâm" (Follow) OA — chính sách Zalo, cần hướng dẫn driver follow OA.
Đã có giấy phép hộ kinh doanh để hoàn tất xác thực doanh nghiệp OA.

### Vercel environment variables (tổng hợp)

| Variable | Dùng trong |
|---|---|
| `ANTHROPIC_API_KEY` | `api/chat.js` |
| `VIETMAP_API_KEY` | `api/maps.js` |
| `SUPABASE_URL` | `api/subscribe.js`, `api/notify.js`, `api/send-otp.js`, `api/verify-otp.js`, `api/route-salary.js` |
| `SUPABASE_SERVICE_KEY` | `api/subscribe.js`, `api/notify.js`, `api/send-otp.js`, `api/verify-otp.js`, `api/route-salary.js` |
| `VAPID_SUBJECT` | `api/notify.js` |
| `VAPID_PUBLIC_KEY` | `api/notify.js` |
| `VAPID_PRIVATE_KEY` | `api/notify.js` |
| `ZALO_ACCESS_TOKEN` | `api/send-otp.js` (Zalo OA access token — bỏ trống để dùng dev mode log) |
| `ZALO_REFRESH_TOKEN` | `api/send-otp.js` |
| `ZALO_APP_ID` | `api/send-otp.js` |
| `ZALO_APP_SECRET` | `api/send-otp.js` |
| `OPENROUTER_API_KEY` | `api/parse-diem.js`, `api/parse-hoi-thoai.js`, `api/phan-loai-bao-duong.js` |

## Database

```
users          (id, email, full_name, sdt, role, owner_id, cho_phep_xem_luong bool)
                -- role: 'owner' | 'driver' | 'supervisor'
                -- owner_id: uuid FK → users.id; set khi owner tạo driver/supervisor; NULL cho owner row
                -- supervisor.owner_id = admin owner's users.id (giống pattern driver)
                -- cho_phep_xem_luong: chỉ meaningful trên owner row; driver đọc qua FK owner_id
trips          (id, owner_id, ngay_bat_dau, ngay_ket_thuc, tuyen_duong, doanh_thu,
                chi_phi, luong_chuyen, tam_ung, hoan_ung, tai_xe_id, xe_id,
                ghi_chu, trang_thai, anh_hoa_don,
                lat_bat_dau, lng_bat_dau, lat_ket_thuc, lng_ket_thuc,
                km_ke_hoach numeric, km_duyet numeric, trang_thai_giao text)
                -- ngay_bat_dau/ngay_ket_thuc: timestamptz
                -- trang_thai: 'dang_chay' | 'hoan_thanh'
                -- trang_thai_giao: 'cho_nhan' (owner tạo, driver chưa bắt đầu) | 'dang_thuc_hien' (tất cả diem đã confirm)
                -- anh_hoa_don: legacy, không còn dùng trong flow mới
                -- chi_phi: được sync tự động bởi DB trigger từ chi_phi_chuyen
                -- lat/lng fields: nullable, lưu tọa độ GPS khi tạo/hoàn thành chuyến
                -- xe_id: uuid FK → xe(id), set khi owner tạo chuyến
                -- km_ke_hoach: km tính từ Google Maps khi owner tạo chuyến
                -- km_duyet: nullable, km thực tế sau khi chuyến kết thúc (chưa dùng)
chi_phi_chuyen (id, trip_id, loai, mo_ta, so_tien, anh_url, created_at, lat, lng,
                anh_realtime bool, is_legacy bool DEFAULT false, nguon_tien text, so_lit numeric)
                -- loai: 'xang' | 'bai_xe' | 'khac'  (sua_xe đã bỏ — sửa chữa dùng bao_duong)
                -- so_lit: nullable, số lít xăng (chỉ nhập cho loai='xang')
                -- anh_url: public URL từ storage bucket 'receipts'
                -- lat/lng: nullable, tọa độ GPS khi thêm chi phí
                -- anh_realtime: true=ảnh chụp camera realtime, false=upload từ gallery, null=không xác định/không có ảnh
                -- is_legacy: true cho entries trước phase 1 (không có bằng chứng realtime); driver-page.html chỉ insert is_legacy=false
                -- nguon_tien: 'driver_paid' (tài xế tự chi, móc tạm ứng) | 'owner_paid' (chủ chuyển khoản) | NULL (legacy, bỏ qua khỏi balance)
                -- CONSTRAINT: nguon_tien IS NULL OR nguon_tien IN ('driver_paid', 'owner_paid')
tam_ung_thang  (id, owner_id, tai_xe_id, thang, so_tien, ghi_chu, trang_thai text DEFAULT 'confirmed')
                -- thang format: 'YYYY-MM'; trang_thai phải tạo thủ công trên Supabase dashboard
xe             (id, owner_id, bien_so, loai_xe, nam_sx, trang_thai, tai_xe_id, luong_co_ban int,
                cach_tinh_luong text, gia_tri_luong int)
                -- trang_thai: 'hoat_dong' | 'bao_duong' | 'tam_nghi'
                -- nam_sx: tồn tại trong DB nhưng ẩn khỏi UI vehicles.html
                -- tai_xe_id: không có UNIQUE constraint trong DB, app tự enforce
                -- luong_co_ban: tồn tại trong DB nhưng ẩn khỏi UI vehicles.html (không còn dùng trong INSERT/UPDATE); owner nhập lương cơ bản trực tiếp qua luong_thang.luong_co_ban_snapshot
                -- cach_tinh_luong: 'khoan_chuyen' | 'phan_tram_doanh_thu' (default 'khoan_chuyen')
                -- gia_tri_luong: nếu khoan_chuyen → số VNĐ cố định; nếu phan_tram_doanh_thu → % (0–100)
bao_duong      (id, owner_id, xe_id, ngay, loai, mo_ta, chi_phi, created_at,
                bo_phan text, ngay_tiep_theo date,
                anh_url text, lat float, lng float, anh_realtime bool,
                nguoi_nhap text, tai_xe_id uuid, trip_id uuid, hinh_thuc_sua text)
                -- loai: 'hong_hoc' | 'linh_kien' | 'lop_xe' | 'dinh_ky'
                -- hinh_thuc_sua: 'tai_gara' | 'luu_dong', bắt buộc chọn khi nhập (validate client); records cũ = null, không backfill; chi phí lưu động cao hơn gộp chung vào chi_phi, không tách cột phí riêng
                -- bo_phan: nullable, tên bộ phận bảo dưỡng (vd: "Lốp trước trái")
                -- ngay_tiep_theo: nullable date, dùng để cảnh báo bảo dưỡng tiếp theo trên bảng xe
                -- anh_url: nullable, public URL ảnh từ storage bucket 'receipts'
                -- lat/lng: nullable, tọa độ GPS khi báo (bắt buộc khi driver submit)
                -- nguoi_nhap: 'driver' | 'owner', phân biệt nguồn nhập
                -- tai_xe_id: nullable uuid FK → users(id) ON DELETE SET NULL; set khi driver nhập
                -- trip_id: nullable uuid FK → trips(id); chuyến đang chạy lúc báo (nếu có)
                -- anh_realtime: true=camera realtime, null=không xác định/không có ảnh
luong_thang    (id, owner_id, tai_xe_id, thang text, luong_co_ban_snapshot int, ngay_lam int default 26,
                ap_dung_luong_co_ban bool DEFAULT false,
                phu_cap int, thuong int, khau_tru int, ghi_chu text, created_at, updated_at)
                -- thang format: 'YYYY-MM'; UNIQUE(tai_xe_id, thang)
                -- FK owner_id → public.users(id) ON DELETE CASCADE
                -- FK tai_xe_id → public.users(id) ON DELETE CASCADE
                -- ngay_lam: còn trong DB nhưng không còn dùng trong UI/công thức (bỏ từ session lương v2)
                -- ap_dung_luong_co_ban: toggle có tính lương cơ bản vào thực lĩnh không
                -- thuc_linh = (ap_dung_luong_co_ban ? luong_co_ban_snapshot : 0) + Σluong_chuyen + phu_cap + thuong - Σtam_ung + Σhoan_ung - khau_tru
                -- Σluong_chuyen/tam_ung/hoan_ung query LIVE từ trips (trang_thai='hoan_thanh', ngay_ket_thuc trong tháng)
bang_luong_km  (id, owner_id, loai_xe text NOT NULL, km_tu int, km_den int, so_tien int)
                -- loai_xe: khớp với xe.loai_xe; owner define bảng lương km theo loại xe
                -- km_tu/km_den: range km; km_den nullable = không giới hạn trên
                -- owner-dashboard.html query: .eq('loai_xe', xe.loai_xe).lte('km_tu', km).or('km_den.gte.N,km_den.is.null').limit(1)
diem_hanh_trinh (id, trip_id uuid, owner_id uuid, thu_tu int, loai text, dia_chi text,
                 lat numeric, lng numeric, trang_thai text DEFAULT 'chua_thuc_hien',
                 anh_url text, anh_realtime bool, created_at timestamptz,
                 ten_lien_he text, sdt_lien_he text, ghi_chu text)
                -- loai: 'boc_hang' | 'giao_hang'
                -- trang_thai: 'chua_thuc_hien' | 'hoan_thanh'
                -- anh_url: public URL ảnh tại điểm (chụp bởi driver khi confirm)
                -- anh_realtime: true khi driver confirm (camera-only)
                -- ten_lien_he/sdt_lien_he/ghi_chu: thông tin liên hệ tại điểm; nullable (records cũ = null)
push_subscriptions (user_id uuid PK, subscription_json jsonb)          -- Web Push subscription object; upsert on conflict user_id
notify_settings    (user_id uuid PK, notify_new_trip bool, notify_complete bool, notify_expense bool, notify_maintenance bool)
                                                                        -- NULL row = tất cả bật; chỉ cần upsert khi owner thay đổi
route_salary       (owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                    ma_tuyen text NOT NULL, luong_tai_xe bigint NOT NULL, updated_at timestamptz DEFAULT NOW(),
                    PRIMARY KEY (owner_id, ma_tuyen))
                   -- bộ nhớ lương tài xế theo tuyến đường chuẩn hóa (vd: 'DLK-SGN')
                   -- owner_id từ server (JWT-verified), KHÔNG từ client; chỉ co_dinh mode dùng
                   -- ma_tuyen derive từ deriveTuyen() trong route-pricing.js; không lưu nếu chứa 'XX'
otp_codes      (id uuid PK, sdt text, code text, expires_at timestamptz,
                used bool DEFAULT false, wrong_attempts int DEFAULT 0,
                created_at timestamptz DEFAULT now())
                -- OTP đăng nhập Zalo (driver+supervisor); chi tiết flow xem docs/api.md (send-otp/verify-otp)
                -- created_at DEFAULT now() bắt buộc — cả 2 lớp rate-limit dựa vào nó
sessions       (token text PK, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                created_at timestamptz DEFAULT now())
                -- session token cho user Zalo (driver_token localStorage); KHÔNG có expiry (chủ ý)
                -- FK user_id → public.users(id), KHÔNG auth.users; token PK để verify-session .maybeSingle() an toàn
```

- `tai_xe_id` luôn = `users.id` (không phải Auth UUID).
- `ngay_bat_dau` dùng `new Date().toISOString()` khi insert, hiển thị qua `formatDate()` thành `HH:MM - DD/MM/YY`.
- Filter tháng dùng: `.gte('ngay_bat_dau', start + 'T00:00:00').lt('ngay_bat_dau', endStr + 'T00:00:00')`.
- **DB trigger** (cần tạo trong Supabase): sau mỗi insert/update/delete trên `chi_phi_chuyen`, trigger tự update `trips.chi_phi = SUM(so_tien)` của trip tương ứng. Nếu trigger chưa tồn tại, `trips.chi_phi` sẽ không tự cập nhật.
- **Applied migrations** (đã apply; giữ lại để tham khảo schema history):
  ```sql
  -- bang_luong_km: đổi từ xe_id sang loai_xe
  ALTER TABLE bang_luong_km DROP COLUMN IF EXISTS xe_id;
  ALTER TABLE bang_luong_km ADD COLUMN IF NOT EXISTS loai_xe text NOT NULL DEFAULT '';

  -- trips: thêm cột km + trang_thai_giao
  ALTER TABLE trips ADD COLUMN IF NOT EXISTS km_ke_hoach numeric;
  ALTER TABLE trips ADD COLUMN IF NOT EXISTS km_duyet numeric;
  ALTER TABLE trips ADD COLUMN IF NOT EXISTS trang_thai_giao text;

  -- diem_hanh_trinh: tạo bảng + thêm cột ảnh
  CREATE TABLE IF NOT EXISTS diem_hanh_trinh (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id uuid, owner_id uuid, thu_tu int, loai text, dia_chi text,
    lat numeric, lng numeric, trang_thai text DEFAULT 'chua_thuc_hien',
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE diem_hanh_trinh ADD COLUMN IF NOT EXISTS anh_url text;
  ALTER TABLE diem_hanh_trinh ADD COLUMN IF NOT EXISTS anh_realtime bool;

  -- diem_hanh_trinh: thêm thông tin liên hệ tại điểm
  ALTER TABLE diem_hanh_trinh ADD COLUMN IF NOT EXISTS ten_lien_he text;
  ALTER TABLE diem_hanh_trinh ADD COLUMN IF NOT EXISTS sdt_lien_he text;
  ALTER TABLE diem_hanh_trinh ADD COLUMN IF NOT EXISTS ghi_chu text;

  -- luong_thang: thêm toggle lương cơ bản (bỏ công thức ngày công)
  ALTER TABLE luong_thang ADD COLUMN IF NOT EXISTS ap_dung_luong_co_ban bool DEFAULT false;

  -- bao_duong: thêm hình thức sửa (tại gara / lưu động)
  ALTER TABLE bao_duong ADD COLUMN IF NOT EXISTS hinh_thuc_sua text;
  ```

## Storage

- Bucket: `receipts` (cần Public access để `getPublicUrl()` hoạt động).
- Path format: `{users.id}/{timestamp}.{ext}` — extension đã sanitize regex.
- Field `anh_url` trong `chi_phi_chuyen` lưu public URL. Field `anh_hoa_don` trong `trips` là legacy.

## Notes / Gotchas

- **RLS disabled** trên tất cả tables. Khi bật RLS, các chỗ sau sẽ break:
  - `bai10.loadStats()` — query `trips`/`users` công khai để hiển thị landing stats.
  - Page admin/driver sẽ cần policy "user đọc được row của mình" + "owner đọc được tất cả".
- **`bai10.checkUserRole`**: Khi email không tìm thấy trong `users`, **không INSERT** — hiện inline error card (ẩn login UI, hiện card đỏ với nút "Thử lại bằng tài khoản khác" gọi `signOut()` + redirect `bai10.html`). `shared.getUserRole/getUserProfile` chỉ select. Drivers phải được owner tạo trước qua `driver.html`.
- **`bai10.formatStatNumber`** (local) ≠ `shared.formatMoney`: bai10 hiển thị dạng rút gọn `1.2B`/`345M`/`12K`, các page khác dùng full `1.234.567 đ`.
- **`formatDate` timezone**: hàm cộng `7 * 60 * 60 * 1000` ms vào UTC timestamp rồi dùng `getUTC*` — luôn hiển thị giờ Việt Nam (UTC+7) bất kể timezone của thiết bị. Output format: `HH:MM - DD/MM/YY` (2 chữ số năm). Lưu ý: nếu `dateStr` không có suffix timezone (không có `Z`/`+00:00`), `new Date()` parse theo local time → double-offset trên thiết bị UTC+7; thực tế không xảy ra vì Supabase luôn trả ISO string có timezone.
- **`formatDate` với `date`-only column**: cột `bao_duong.ngay` là kiểu `date` (trả về `'YYYY-MM-DD'` không có timezone). `new Date('2026-05-17')` parse là UTC midnight → sau khi cộng +7h sẽ hiển thị `07:00 - 17/05/26` thay vì chỉ ngày. Đây là known issue — nếu cần hiển thị chỉ ngày từ `date` column, parse thủ công thay vì dùng `formatDate`.
- **Currency**: luôn `đ` (chữ thường), KHÔNG dùng `₫` unicode.
- **Google OAuth `redirectTo`**: dùng `window.location.origin + '/bai10.html'` để hoạt động cả local và production.
- **`maybeSingle()` error handling**: luôn destructure cả `data` lẫn `error`. `{ data: null, error: null }` nghĩa là không tìm thấy row (bình thường). `error !== null` mới là lỗi DB thật. Pattern chuẩn: `const { data: x, error: xErr } = await sb.from(...).maybeSingle(); if (xErr) { showToast(...); return } if (x) { /* trùng */ return }`
- **Clickable cell pattern**: khi một cell trong bảng là entry point vào modal, tạo `<span>` bên trong `<td>` với `style.color = 'var(--primary)'`, `textDecoration = 'underline'`, `cursor = 'pointer'`. Dùng `addEventListener('click', ...)` thay vì `onclick` attribute (đảm bảo closure đúng trong forEach).
- **`owner_id` pattern** — `trips`, `xe`, `bao_duong`, `tam_ung_thang`, `luong_thang` đều có cột `owner_id` = `users.id` của owner. **Mọi SELECT phải filter `.eq('owner_id', ...)`, mọi INSERT phải include `owner_id`.** Mỗi page lưu owner_id vào biến riêng (gọi là `effectiveOwnerId` trong init — bằng `profile.id` cho owner, bằng `profile.owner_id` cho supervisor):
  - `owner-dashboard.html` → `currentOwnerProfileId` (module level)
  - `driver.html` → `ownerProfileId` (module level)
  - `vehicles.html` → `ownerProfileId` (module level)
  - `luong-thang.html` → `ownerProfileId` (module level)
  - Ngoài ra mỗi trang có `currentUserId = auth.profile.id` (luôn là ID user đang đăng nhập) dùng riêng cho notify settings/push subscription
  - `driver-page.html` → `currentOwnerId` (module level, query `users.owner_id where id = currentProfileId` trong `initPage()`)
  - `trip-detail.html` → `ownerId` (local trong `initPage()`: nếu owner thì `currentProfile.id`, nếu driver thì query DB; nếu null thì toast + redirect)
- **FK trên `notify_settings`, `push_subscriptions`, `sessions`**: cột `user_id` phải references `public.users(id)`, **không phải** `auth.users(id)`. Nếu tạo FK sai sang `auth.users`, insert/upsert sẽ fail với foreign key violation vì app dùng `users.id` (DB-generated UUID), không phải Auth UUID.
