# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fleet management app cho công ty vận tải Ea Kar — owner theo dõi chuyến/doanh thu/lương, driver nhập chuyến và upload ảnh hóa đơn. Đây là dự án học code (`bai*`) tăng dần, các file `bai1-9.html` là bài tập cũ, app thực tế chạy trên `bai10.html` + 4 trang admin/driver.

- Stack: Vanilla HTML/CSS/JS + Supabase (Postgres + Auth + Storage + Realtime) + Vercel
- Live: https://fucking-learning-code.vercel.app
- Supabase project ref: `icwmtqfpbefntfxboofr`
- Anon key (public, đã có trong `shared.js`):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljd210cWZwYmVmbnRmeGJvb2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Mzg3NzgsImV4cCI6MjA5MjUxNDc3OH0.N1gsPt4eZav2LL2XDttqlsAB06b1UzXb4bFTMi3K8NM
  ```

## Workflow

Không có build step, không có test runner, không có lint. Quy trình:

- **Edit**: sửa file `.html`/`.css`/`.js` trực tiếp.
- **Preview local**: mở file qua `file://` (đa số chạy được), hoặc `python -m http.server` để tránh lỗi service worker / relative path.
- **Deploy**: `git push origin main` → Vercel auto-deploy.
- **DB schema changes**: vào Supabase dashboard project `icwmtqfpbefntfxboofr` chỉnh tay (SQL editor hoặc Table editor).
- **api/ dependencies**: `npm install` cài `web-push` + `@supabase/supabase-js` cho Vercel serverless functions. Không cần chạy lại khi chỉ sửa HTML/CSS/JS frontend.

## Architecture

### Page roles
- `bai10.html` — landing page + Google OAuth + role redirect. Có `<style>` block riêng (~220 dòng) cho hero/stats/features layout (KHÔNG dùng `.card` chuẩn).
- `owner-dashboard.html` — owner xem báo cáo trips, filter tháng, realtime subscribe `trips`. Header có nav đến driver/vehicles. Bảng trips có cột "Chi tiết" link đến `trip-detail.html`. Có floating AI chatbot (nút FAB góc phải) gọi qua `/api/chat`; `driverMap` trong chatbot context được filter bằng `.eq('owner_id', currentOwnerProfileId)` để chỉ lấy drivers của owner đang đăng nhập. Bảng trips: row highlight bằng click + touchend (xóa highlight cũ trên `#report-body tr` trước, set background `#e3f2fd` cho row vừa tap/click). Mobile ≤600px: ẩn cột 4 (Chi phí) và cột 6 (Lương) bằng `nth-child` trong `<style>` block ở `<head>`. **Notify panel**: tất cả 4 trang owner (`owner-dashboard`, `driver`, `vehicles`, `luong-thang`) đều có nút 🔔 `#btn-notify` ở header mở `#notify-panel` (fixed, top:64px right:16px, click-outside để đóng) với 4 toggle switch (notify_new_trip / notify_complete / notify_expense / notify_maintenance), load/save qua `notify_settings` table. `setupPushNotifications(userId)` chạy mỗi lần login. JS dependencies (`VAPID_PUBLIC_KEY`, `urlBase64ToUint8Array`, `setupPushNotifications`, `loadNotifySettings`, `saveNotifySetting`, `toggleNotifyPanel`) định nghĩa **local trong mỗi file** (không phải `shared.js`); dùng `ownerProfileId` (trừ owner-dashboard dùng `currentOwnerProfileId`). **Tạo chuyến**: nút "➕ Tạo chuyến" mở modal nhập điểm hành trình (bốc/giao), assign xe + driver, gọi `POST /api/maps` (origin=điểm bốc đầu, destination=điểm giao cuối, waypoints=giao slice trừ điểm cuối) để tính `km_ke_hoach` + `optimized_order`, lookup `bang_luong_km` để tính `luong_chuyen`, INSERT `trips` (trang_thai=`'dang_chay'`, trang_thai_giao=`'cho_nhan'`) + bulk INSERT `diem_hanh_trinh`, push notify driver. Module-level vars: `xeList`, `driverList`. `buildDiemRow(containerId)` tạo row với input địa chỉ, hidden lat/lng, nút GPS, nút xóa. `collectDiems(containerId)` trả `[{dia_chi, lat, lng}]`. Bang_luong_km query: `.eq('loai_xe', xe.loai_xe).lte('km_tu', km).or('km_den.gte.'+km+',km_den.is.null').limit(1)` — dùng `.limit(1)` (KHÔNG `.maybeSingle()`) rồi access `rateRows[0]`. Waypoints cho Maps API: chỉ giao points (không trộn bốc), giao points slice `[0, -1]` = `giaoWaypoints`; `optimized_order` index vào `giaoWaypoints`; reorder: `[...optimized_order.map(i => giaoWaypoints[i]), giaoDiems[last]]`. Loại điểm insert vào `diem_hanh_trinh`: `'boc_hang'` / `'giao_hang'`.
- `trip-detail.html` — trang shared cho cả driver và owner xem chi tiết 1 chuyến. URL param: `?trip_id=`. `currentProfile` là module-level var (set trong `initPage()`). Auth dùng `getSession() + getUserProfile()` (không dùng `requireRole`). Driver chỉ xem được trip của mình; owner xem được tất cả. `ownerId` cho driver: query `users.select('owner_id').eq('id', currentProfile.id)` — dùng FK `owner_id` của driver, không query theo role. Trips query dùng join: `.select('*, tai_xe:users!tai_xe_id(full_name), xe:xe(bien_so)')`. `renderTripInfo()` hiển thị thêm 2 row: Tài xế (`trip.tai_xe.full_name`) và Biển số (`formatBienSo(trip.xe.bien_so)`). `goBack()` ưu tiên `document.referrer`, fallback theo `currentProfile.role` (driver → driver-page, owner → owner-dashboard, else → bai10). Driver + dang_chay: có thể thêm/sửa/xóa chi phí inline. Hiển thị GPS links nếu có tọa độ. Ảnh hóa đơn trong bảng chi phí dùng `openImageModal(url)` (fullscreen overlay, click ngoài hoặc ✕ để đóng) — không mở tab mới. EXPENSE_TYPES hiện tại: `{ xang, bai_xe, khac }` (đồng bộ với driver-page.html, `sua_xe` đã bỏ). Có 2 local helpers `numberToVietnamese` và `addMoneyHint` (copy từ driver-page.html). Khi driver thêm/sửa chi phí: ảnh bắt buộc + camera-only + GPS bắt buộc + moneyHint live, tương tự driver-page.html. Bảng chi phí hiển thị badge `⚠️ Cũ` cho entries `is_legacy=true`; nút ảnh hiển thị `📷⚠️` với tooltip cảnh báo nếu `anh_realtime === false`. Cột số tiền prefix icon nguồn: `👤` (driver_paid) / `🏢` (owner_paid) / trống (legacy). Add/edit form chi phí có thêm select nguon_tien (bắt buộc chọn, placeholder → validation fail).
- `driver-page.html` — driver **không còn tự tạo chuyến** (owner tạo và assign). 2 tab ("Đang chạy" / "Hoàn thành"). Tab "Đang chạy" query `.eq('trang_thai', 'dang_chay').in('trang_thai_giao', ['cho_nhan', 'dang_thuc_hien'])` — chỉ hiện chuyến owner tạo + assign cho driver. `#btn-new-trip` và form tạo chuyến tồn tại trong HTML nhưng **luôn `display:none`** — `initPage()` không bao giờ show nó. Có nút "🔧 Báo bảo dưỡng" (`#btn-bao-duong`, `btn-warning`) trong filter-bar, chỉ hiện khi xe assigned, gọi `openMaintenanceModal()` → INSERT vào `bao_duong` với GPS bắt buộc + `notifyOwner('maintenance', ...)`. Module-level vars: `currentProfileId`, `currentDriverName`, `currentOwnerId` (từ `users.owner_id` của driver row), `currentBienSo` (từ `xe` table), `currentXeId` (từ `xe.id`), `confirmDiemData`, `confirmDiemPhoto`. `initPage()` kiểm tra xe assigned: query `xe.select('id, bien_so')`, set cả `currentBienSo` và `currentXeId`; nếu không có xe → hiện warning card đỏ trước `#active-trips` + ẩn `#btn-bao-duong`; nếu có xe → hiện `#btn-bao-duong`. Tab "Hoàn thành" link đến `trip-detail.html?trip_id=`. EXPENSE_TYPES hiện tại: `{ xang, bai_xe, khac }` — **`sua_xe` đã bỏ** (sửa chữa báo qua `bao_duong`). Có 2 local helpers: `numberToVietnamese(n)` (đọc số tiền thành chữ VN, e.g. "Một trăm ba mươi lăm nghìn đ" — capitalize first letter) và `addMoneyHint(input)` (auto-format input thành dấu chấm nghìn, lưu raw digits vào `input.dataset.rawValue`, hiển thị hint chữ bên dưới). Các submit function đọc `dataset.rawValue || .value` để lấy số thực. Khi thêm chi phí: ảnh bắt buộc, chỉ chụp camera (không có nút thư viện), tự động set `anh_realtime=true` + `is_legacy=false`. Khi sửa: nếu đổi ảnh thì cũng phải chụp mới (camera-only), `anh_realtime=true`; nếu xóa ảnh thì `anh_realtime=null`; nếu giữ nguyên ảnh thì `anh_realtime` giữ giá trị cũ trong DB. Bảo dưỡng cũng theo flow tương tự (ảnh bắt buộc, camera-only, `anh_realtime=true`). `buildTripCard(trip)` là **async** — query `xe` để lấy `xeConfig` (`cach_tinh_luong`, `gia_tri_luong`), build `diemSection` div với id `diem-section-{tripId}`, gọi `buildDiemHanhTrinhSection(tripId).then(el => diemSection.appendChild(el))`, rồi gọi `buildCompleteForm(tripId, xeConfig)` synchronously. `loadActiveTrips()` dùng `for...of` với `await` thay vì `forEach` vì `buildTripCard` là async. `calcLuongChuyen(xeConfig, doanhThu)` tính lương: `khoan_chuyen` → trả `gia_tri_luong` cố định; `phan_tram_doanh_thu` → `Math.round(doanhThu * gia_tri_luong / 100)`. `buildCompleteForm` không có field "Lương chuyến" — thay bằng preview text tự tính; nếu mode `phan_tram_doanh_thu` thì preview live update khi nhập doanh thu. `submitComplete(tripId, xeConfig)` tính `luong_chuyen = calcLuongChuyen(xeConfig, doanh_thu)` thay vì đọc từ form. **Diem hanh trinh**: `buildDiemHanhTrinhSection(tripId)` async — query `diem_hanh_trinh` order `thu_tu`, render từng điểm với badge loại (`'boc_hang'`→📦 Bốc / `'giao_hang'`→🚩 Giao), địa chỉ, trạng thái (✅ + thumbnail nếu `hoan_thanh`, nút "✓ Xác nhận tại điểm" nếu `chua_thuc_hien`). Modal `#confirm-diem-modal`: chụp ảnh camera-only bắt buộc + GPS bắt buộc. `submitConfirmDiem()`: validate photo → GPS → upload (bucket `receipts`) → UPDATE `diem_hanh_trinh` (trang_thai=`'hoan_thanh'`, anh_url, anh_realtime=true, lat, lng) → check pending còn lại → nếu 0 pending thì UPDATE `trips.trang_thai_giao='dang_thuc_hien'` → re-render diem section in-place (`diemSection.textContent=''` + `buildDiemHanhTrinhSection().then()`).
- `driver.html` — owner quản lý tài xế & công nợ, export Excel. Bảng có **5 cột**: Họ và tên | SĐT | Xe đang chạy | Đang giữ | Thao tác — **không có month filter** ở page level, **không có PDF**. `loadDrivers()` build `xeMap[tai_xe_id → bien_so]` từ query `xe` (non-null `tai_xe_id`), sau đó dùng `calcDriverBalance()` để tính balance. **Balance** = Σ`tam_ung`(trips hoàn thành) + Σ`tam_ung_thang` − Σ`hoan_ung`(trips hoàn thành) − Σ`chi_phi_driver_paid`(ALL trips, non-legacy); màu đỏ nếu > 0, xanh nếu ≤ 0. Click tên tài xế → `openTripsModal(driverId, driverName, driverEmail, driverSdt, driverBienSo)` — modal 5 tham số, hiện info section (email/SĐT/xe), month filter nội bộ, `#trips-modal-list` chứa bảng trips (render bởi `renderTripsList()` riêng biệt), nút xóa tài xế ở cuối modal (async handler: `await deleteDriver()`, chỉ `closeTripsModal()` khi return `true`). `deleteDriver(id, name)` là async, return `true`/`false`. Click cột "Đang giữ" → `openBalanceModal(driverId, driverName)` hiện **debt ledger timeline**: query trip IDs (all-time, allDriverTrips), song song query trips hoàn thành (tam_ung/hoan_ung > 0), tam_ung_thang, chi_phi_chuyen (nguon_tien='driver_paid', is_legacy=false, in allTripIds); build `entries[]` `{ date, type, label, amount, sign }` — trip tam_ung → `type:'trip_advance'` sign +1, trip hoan_ung → `type:'refund'` sign -1, tam_ung_thang → `type:'advance'` date=`thang+'-01'` sign +1, chi_phi_driver_paid → `type:'expense_driver'` sign -1; sort tăng dần; tính `running_balance` tích lũy; render bảng 5 cột (Ngày | Loại | Mô tả | Số tiền | Số dư) với badge màu (xám/xanh/cam/đỏ theo type, `expense_driver` badge: `background:#ffebee;color:#c62828`) + dòng tổng "Tổng đang giữ" border-top dày. Date parse dùng local methods (`getDate/getMonth/getFullYear`) — KHÔNG dùng UTC methods. Nút `+ Tạm ứng` → `openAdvanceModal()` INSERT vào `tam_ung_thang`. Nút "💰 Xem lương" → `luong-thang.html`. `addDriver()` check trùng email + SĐT qua `maybeSingle()` trước INSERT, include `owner_id: ownerProfileId`.
- `vehicles.html` — owner quản lý xe + bảo dưỡng inline. Click biển số → modal đổi tài xế (kiểm tra tài xế đang lái xe khác). Nút "📋 Chuyến" → modal popup xem trips của xe, query bằng `xe_id` (KHÔNG phải `tai_xe_id`) để lấy đúng chuyến của xe đó qua mọi tài xế — filter tháng bên trong modal, `#trips-filter-month`. `changeStatus(id, status, taiXeId)` cycle 2 chiều tùy driver: có tài xế → `hoat_dong ↔ bao_duong`; không tài xế → `tam_nghi ↔ bao_duong`. `trang_thai` tự set `hoat_dong`/`tam_nghi` theo `tai_xe_id`. `nam_sx` là DB column nhưng ẩn khỏi UI. `tai_xe_id` unique được enforce ở app, không có DB constraint. Dùng `formatBienSo(s)` từ `shared.js` khi hiển thị và khi blur khỏi input biển số. Bảng xe có thêm 2 cột inline-editable: "Cách tính lương" (select `khoan_chuyen`/`phan_tram_doanh_thu`) và "Giá trị" (input số, suffix đổi giữa `đ`/`%` theo mode). Onchange select → auto-save cả `cach_tinh_luong` và `gia_tri_luong=0` vào DB + reset input. Blur input → validate pct 0–100 + save. Form "Thêm xe mới" cũng có 2 field tương ứng; onchange dropdown trong form phải clear value+rawValue+suffix. `addDotFormat` dùng cho input giá trị lương (xem `driver-page.html` pattern). Khi switch mode, phải set `input.dataset.rawValue = ''` explicitly (programmatic value change không trigger input event). **Bảo dưỡng**: `PRESET_PARTS` là array 21 bộ phận hardcode (file-level const). Form bảo dưỡng có thêm `maint-bophan-{id}` (text input với datalist `bophan-suggestions-{id}`) và `maint-ngaytiep-{id}` (date). `loadMaintenance()` populate datalist từ lịch sử + PRESET_PARTS (unique merge), thêm filter `<select>` lọc theo `bo_phan` phía trên bảng. Bảng history query dùng join `.select('*, tai_xe:users!tai_xe_id(full_name)')`, các cột: Ngày | Bộ phận | Người nhập | Loại | Mô tả | Chi phí | (sửa/xóa). "Người nhập": `nguoi_nhap === 'driver'` hiện `👤 {full_name}`, `'owner'` hiện `🏢 Chủ xe`. Cột Mô tả append link `→ Xem chuyến` (mở tab mới) nếu `trip_id` có giá trị. `loadVehicles()` query thêm `bao_duong.ngay_tiep_theo`, build `nextMaintMap[xe_id]` = earliest `ngay_tiep_theo`, append badge cảnh báo vào plateCell: `⚠️ N ngày` (warning) nếu 0 ≤ daysLeft ≤ 7, `🔴 Quá hạn N ngày` (danger) nếu daysLeft < 0. **Bảng lương km**: card riêng cho owner define bảng lương theo `loai_xe` + km range. `loadKmRates()` query `bang_luong_km` where `owner_id`, render bảng + filter dropdown theo loại xe. `addKmRate()` validate + INSERT. `deleteKmRate(id)` confirm + DELETE. `init()` calls `await loadKmRates()` + `addDotFormat(#km-so-tien)`.
- `style.css` — design system shared, dùng CSS variables.
- `shared.js` — JS utilities shared (xem dưới).
- `luong-thang.html` — owner quản lý bảng lương tháng + xuất PDF phiếu lương. Toggle `cho_phep_xem_luong` trên `users` (owner row) cho phép driver xem lương. Query logic tách thành `fetchLuongData(thangStr)` (dùng chung cho cả render bảng và in PDF): select drivers với `id, full_name, sdt`, query xe, upsert `luong_thang` rows (auto-INSERT nếu chưa có, snapshot `luong_co_ban` từ xe, `ngay_lam=26`), query trips theo tháng. Bảng **13 cột**: Tên | Biển số | Lương CB | Ngày làm | Σ chuyến | Phụ cấp | Thưởng | Σ tạm ứng | Σ hoàn ứng | Khấu trừ | THỰC LĨNH | Sửa | **In phiếu**. PDF: `buildPayslipHTML(luongRow, driver, xe, trips, thangStr)` trả về DOM element (width 595px, toàn bộ inline style). `printPayslip()` dùng `html2canvas` (scale 2) + `jspdf.jsPDF` để download file đơn. `printAllPayslips()` loop qua tất cả drivers tạo 1 PDF nhiều trang. Nút "🖨️ In tất cả" ở header desktop + hamburger menu (`menu-print-all`). `slugify()` local helper: `.replace(/đ/g,'d').replace(/Đ/g,'d').normalize('NFD').replace(/[̀-ͯ]/g,'')...`. CDN: `jspdf@2.5.1` (UMD) → global `jspdf.jsPDF`; `html2canvas@1.4.1` → global `html2canvas`. Edit modal cập nhật `ngay_lam, phu_cap, thuong, khau_tru, ghi_chu`. `ownerProfileId` = `auth.profile.id`.
- `luong-cua-toi.html` — driver xem lương của mình. Permission gate: query `users.owner_id` của driver → query `users.cho_phep_xem_luong` của owner; nếu false/null → hiện card đỏ "chưa bật". `initPage()` tạo 2 child div `#balance-container` + `#luong-container` bên trong `#main-content`; gọi `loadBalanceCard()` (không await) + `loadLuong()` (await). **Balance card** (`#balance-container`): hiện số dư tạm ứng bằng `calcDriverBalance()` — màu warning nếu > 0 (đang giữ), success nếu < 0 (chủ nợ). Hiện danh sách tháng dạng card (`#luong-container`, thực lĩnh lớn, nút Chi tiết → modal breakdown). `currentProfileId` = `auth.profile.id`.
- `sw.js` + `manifest.json` — PWA, chỉ register từ `bai10.html`. STATIC_ASSETS chỉ gồm `bai10.html`, `style.css`, `manifest.json`, và icons — **`shared.js` và tất cả admin pages không được pre-cache**, chỉ được dynamic-cache khi đã navigate tới. Khi deploy thay đổi cho bất kỳ file nào trong STATIC_ASSETS, phải bump `CACHE_NAME` trong `sw.js` (hiện tại `van-tai-v22`) để invalidate cache cũ. Có push handler (hiện notification) + notificationclick handler (focus tab cũ hoặc mở tab mới tới URL trong `notification.data.url`).

### shared.js (BẮT BUỘC dùng cho mọi page mới)
```
createSb()              → tạo Supabase client với URL+anon key built-in
formatBienSo(s)         → chuẩn hóa biển số thành dạng "XX-NNN.NN" (uppercase, strip separators)
formatMoney(n)          → "1.234.567 đ" (vi-VN locale + đ ký tự)
formatDate(timestamptz) → "HH:MM - DD/MM/YY" (nhận ISO string hoặc timestamptz từ Supabase)
getUserRole(sb, email)  → role string hoặc null
getUserProfile(sb, email) → { id, role } hoặc null
requireRole(sb, role)   → đảm bảo session + role khớp; redirect bai10 nếu không.
                          Trả { user, profile } hoặc null.
setupLogoutListener(sb) → tự redirect bai10 khi logout từ tab khác.
getLocation()           → Promise<{ lat, lng }> — dùng Geolocation API, timeout 10s.
                          Reject với Error nếu thiết bị không hỗ trợ hoặc user từ chối GPS.
```

Mỗi page admin (driver/vehicles/owner-dashboard) bắt đầu với:
```js
const sb = createSb()
async function initPage() {
    const auth = await requireRole(sb, 'owner')  // hoặc 'driver'
    if (!auth) return
    // ... load data
}
setupLogoutListener(sb)
initPage()
```

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

**DB migration** (phải chạy thủ công trong Supabase SQL editor):
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
- CSS variables ở `:root` của `style.css`: `--primary #1565c0`, `--danger #e74c3c`, `--success #27ae60`, `--warning #e67e22`, `--bg #f0f2f5`, `--white #ffffff`, `--border #e0e0e0`, `--text #444`, `--text-muted #888`, `--shadow`, `--radius 12px`, `--radius-sm 8px`. **`--card-bg` và `--bg-secondary` KHÔNG tồn tại** — dùng `--white` và `--bg` thay thế.
- Button classes: `.btn` (xanh primary), `.btn-danger/.btn-success/.btn-warning/.btn-purple/.btn-gray/.btn-logout/.btn-full/.btn-sm`. **Không dùng inline `style="background:..."`** — đã có class.
- `.form-group input` được style sẵn. `.form-group select` **không** được style — cần inline style: `width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:15px;color:#1a1a2e;background:white`.
- `#receipt-preview` và `#receipt-preview img` được style bằng **ID selector** trong `style.css` — không áp dụng cho dynamic forms. Khi tạo preview image động phải thêm inline style.
- Stat values trong owner-dashboard: `.stat-value.green/red/blue/orange`.
- Bảng nhiều cột bọc trong `<div class="table-scroll wide">` để mobile scroll ngang. Trên desktop ≥1200px, min-width không áp dụng (chỉ active ở ≤1199px) nên bảng tự fit theo container.
- `.container` responsive tiers: `max-width: 900px` (default) → `1400px` (≥1200px) → `1600px` (≥1600px). Không dùng `max-width: 900px` hardcode cho page-level elements vì sẽ break trên desktop rộng.
- Toggle switch notify settings: `.notify-row` (flex row), `.toggle` (label wrapper), `.toggle-slider` (pseudo-element track/thumb). Checked state: `--success` green. Đã có trong `style.css`.
- All asset links dùng **relative path** (`manifest.json`, `style.css`, `sw.js`, `shared.js`) — không có leading `/`.
- **Mobile header pattern** (≤600px): mọi page dùng `<h2>emoji <span class="header-text">Tên trang</span></h2>` — `.header-text` bị ẩn trên mobile qua `style.css`. Buttons nhóm trong `<div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">`. `style.css` có `@media (max-width:600px)` override padding/font-size cho `.header`, `.header h2`, `.header > div`, `.header .btn`/`.btn-logout` — **không cần thêm local `<style>` block** trong từng page cho mobile header.

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

Tất cả dùng ESM (`import`/`export default`). `package.json` khai báo `"type": "module"`.

- **`api/chat.js`** — pure proxy SSE tới Anthropic API; model, system prompt và messages đều đến từ `req.body` (do `owner-dashboard.html` gửi), không có gì hardcode server-side. Env: `ANTHROPIC_API_KEY`.
- **`api/maps.js`** — POST `{ origin, destination, waypoints? }` proxy tới Google Maps Directions API. `origin`/`destination`/waypoints đều là `{ dia_chi?, lat?, lng? }` — nếu có lat+lng dùng `"lat,lng"`, fallback `dia_chi`. Trả `{ km, optimized_order }` hoặc `{ error }`. Env: `GOOGLE_MAPS_API_KEY`.
- **`api/subscribe.js`** — POST `{ user_id, subscription }`, upsert vào `push_subscriptions`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- **`api/notify.js`** — POST `{ owner_id, type, payload }`. Check `notify_settings` bằng `.maybeSingle()` (NULL row = tất cả bật), gửi push qua `web-push`, tự xóa subscription nếu 410. Push payload JSON bao gồm `title`, `body`, `icon`, và `url` (dùng trong `sw.js` notificationclick). URL logic: nếu `payload.trip_id` có giá trị → `/trip-detail.html?trip_id={trip_id}`; ngược lại nếu `type === 'maintenance'` → `/vehicles.html`; còn lại → `/owner-dashboard.html`. `type` và payload fields bắt buộc:
  - `'new_trip'`: `{ driver_name, bien_so, tuyen_duong, trip_id }`
  - `'complete'`: `{ driver_name, bien_so, tuyen_duong, trip_id }`
  - `'expense'`: `{ driver_name, bien_so, loai, so_tien, trip_id }`
  - `'maintenance'`: `{ driver_name, bien_so, bo_phan, chi_phi, trip_id }`
  
  Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

### Vercel environment variables (tổng hợp)

| Variable | Dùng trong |
|---|---|
| `ANTHROPIC_API_KEY` | `api/chat.js` |
| `GOOGLE_MAPS_API_KEY` | `api/maps.js` |
| `SUPABASE_URL` | `api/subscribe.js`, `api/notify.js` |
| `SUPABASE_SERVICE_KEY` | `api/subscribe.js`, `api/notify.js` |
| `VAPID_SUBJECT` | `api/notify.js` |
| `VAPID_PUBLIC_KEY` | `api/notify.js` |
| `VAPID_PRIVATE_KEY` | `api/notify.js` |

## Database

```
users          (id, email, full_name, sdt, role, owner_id, cho_phep_xem_luong bool)
                -- role: 'owner' | 'driver'
                -- owner_id: uuid FK → users.id; set khi owner tạo driver qua driver.html; NULL cho owner row
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
                anh_realtime bool, is_legacy bool DEFAULT false, nguon_tien text)
                -- loai: 'xang' | 'bai_xe' | 'khac'  (sua_xe đã bỏ — sửa chữa dùng bao_duong)
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
                -- luong_co_ban: lương cơ bản tháng (VNĐ), snapshot vào luong_thang khi tạo row
                -- cach_tinh_luong: 'khoan_chuyen' | 'phan_tram_doanh_thu' (default 'khoan_chuyen')
                -- gia_tri_luong: nếu khoan_chuyen → số VNĐ cố định; nếu phan_tram_doanh_thu → % (0–100)
bao_duong      (id, owner_id, xe_id, ngay, loai, mo_ta, chi_phi, created_at,
                bo_phan text, ngay_tiep_theo date,
                anh_url text, lat float, lng float, anh_realtime bool,
                nguoi_nhap text, tai_xe_id uuid, trip_id uuid)
                -- loai: 'hong_hoc' | 'linh_kien' | 'lop_xe' | 'dinh_ky'
                -- bo_phan: nullable, tên bộ phận bảo dưỡng (vd: "Lốp trước trái")
                -- ngay_tiep_theo: nullable date, dùng để cảnh báo bảo dưỡng tiếp theo trên bảng xe
                -- anh_url: nullable, public URL ảnh từ storage bucket 'receipts'
                -- lat/lng: nullable, tọa độ GPS khi báo (bắt buộc khi driver submit)
                -- nguoi_nhap: 'driver' | 'owner', phân biệt nguồn nhập
                -- tai_xe_id: nullable uuid FK → users(id) ON DELETE SET NULL; set khi driver nhập
                -- trip_id: nullable uuid FK → trips(id); chuyến đang chạy lúc báo (nếu có)
                -- anh_realtime: true=camera realtime, null=không xác định/không có ảnh
luong_thang    (id, owner_id, tai_xe_id, thang text, luong_co_ban_snapshot int, ngay_lam int default 26,
                phu_cap int, thuong int, khau_tru int, ghi_chu text, created_at, updated_at)
                -- thang format: 'YYYY-MM'; UNIQUE(tai_xe_id, thang)
                -- FK owner_id → public.users(id) ON DELETE CASCADE
                -- FK tai_xe_id → public.users(id) ON DELETE CASCADE
                -- thuc_linh = round(luong_co_ban_snapshot/26*ngay_lam) + Σluong_chuyen + phu_cap + thuong - Σtam_ung + Σhoan_ung - khau_tru
                -- Σluong_chuyen/tam_ung/hoan_ung query LIVE từ trips (trang_thai='hoan_thanh', ngay_ket_thuc trong tháng)
bang_luong_km  (id, owner_id, loai_xe text NOT NULL, km_tu int, km_den int, so_tien int)
                -- loai_xe: khớp với xe.loai_xe; owner define bảng lương km theo loại xe
                -- km_tu/km_den: range km; km_den nullable = không giới hạn trên
                -- owner-dashboard.html query: .eq('loai_xe', xe.loai_xe).lte('km_tu', km).or('km_den.gte.N,km_den.is.null').limit(1)
diem_hanh_trinh (id, trip_id uuid, owner_id uuid, thu_tu int, loai text, dia_chi text,
                 lat numeric, lng numeric, trang_thai text DEFAULT 'chua_thuc_hien',
                 anh_url text, anh_realtime bool, created_at timestamptz)
                -- loai: 'boc_hang' | 'giao_hang'
                -- trang_thai: 'chua_thuc_hien' | 'hoan_thanh'
                -- anh_url: public URL ảnh tại điểm (chụp bởi driver khi confirm)
                -- anh_realtime: true khi driver confirm (camera-only)
push_subscriptions (user_id uuid PK, subscription_json jsonb)          -- Web Push subscription object; upsert on conflict user_id
notify_settings    (user_id uuid PK, notify_new_trip bool, notify_complete bool, notify_expense bool, notify_maintenance bool)
                                                                        -- NULL row = tất cả bật; chỉ cần upsert khi owner thay đổi
```

- `tai_xe_id` luôn = `users.id` (không phải Auth UUID).
- `ngay_bat_dau` dùng `new Date().toISOString()` khi insert, hiển thị qua `formatDate()` thành `HH:MM - DD/MM/YY`.
- Filter tháng dùng: `.gte('ngay_bat_dau', start + 'T00:00:00').lt('ngay_bat_dau', endStr + 'T00:00:00')`.
- **DB trigger** (cần tạo trong Supabase): sau mỗi insert/update/delete trên `chi_phi_chuyen`, trigger tự update `trips.chi_phi = SUM(so_tien)` của trip tương ứng. Nếu trigger chưa tồn tại, `trips.chi_phi` sẽ không tự cập nhật.
- **Pending migrations** (chạy thủ công trong Supabase SQL editor nếu chưa chạy):
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
- **`owner_id` pattern** — `trips`, `xe`, `bao_duong`, `tam_ung_thang`, `luong_thang` đều có cột `owner_id` = `users.id` của owner. **Mọi SELECT phải filter `.eq('owner_id', ...)`, mọi INSERT phải include `owner_id`.** Mỗi page lưu owner_id vào biến riêng:
  - `owner-dashboard.html` → `currentOwnerProfileId` (module level, gán từ `auth.profile.id` trong `initPage()`)
  - `driver.html` → `ownerProfileId` (module level, gán từ `auth.profile.id` trong `initPage()`)
  - `vehicles.html` → `ownerProfileId` (module level, gán từ `auth.profile.id` trong `init()`)
  - `luong-thang.html` → `ownerProfileId` (module level, gán từ `auth.profile.id` trong `initPage()`)
  - `driver-page.html` → `currentOwnerId` (module level, query `users.owner_id where id = currentProfileId` trong `initPage()`)
  - `trip-detail.html` → `ownerId` (local trong `initPage()`: nếu owner thì `currentProfile.id`, nếu driver thì query DB; nếu null thì toast + redirect)
- **FK trên `notify_settings` và `push_subscriptions`**: cột `user_id` phải references `public.users(id)`, **không phải** `auth.users(id)`. Nếu tạo FK sai sang `auth.users`, insert/upsert sẽ fail với foreign key violation vì app dùng `users.id` (DB-generated UUID), không phải Auth UUID.

