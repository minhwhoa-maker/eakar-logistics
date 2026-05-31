# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fleet management app cho công ty vận tải Ea Kar — owner theo dõi chuyến/doanh thu/lương, driver nhập chuyến và upload ảnh hóa đơn. Khởi nguồn là dự án học code (`bai*`); các bài tập cũ `bai1-9.html` đã xóa, chỉ còn `bai10.html` là landing/auth thực tế. App chạy trên `bai10.html` + 8 trang admin/driver: `owner-dashboard.html`, `driver.html`, `vehicles.html`, `luong-thang.html`, `luong-cua-toi.html`, `driver-page.html`, `trip-detail.html`, `supervisors.html`.

- Stack: Vanilla HTML/CSS/JS + Supabase (Postgres + Auth + Storage + Realtime) + Vercel
- Live: https://fucking-learning-code.vercel.app
- Supabase project ref: `icwmtqfpbefntfxboofr`
- Anon key (public, đã có trong `shared.js`):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljd210cWZwYmVmbnRmeGJvb2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Mzg3NzgsImV4cCI6MjA5MjUxNDc3OH0.N1gsPt4eZav2LL2XDttqlsAB06b1UzXb4bFTMi3K8NM
  ```

## Commands

Không có build step, không có test runner, không có lint. Quy trình:

- **Edit**: sửa file `.html`/`.css`/`.js` trực tiếp.
- **Preview local**: mở file qua `file://` (đa số chạy được), hoặc `python -m http.server` để tránh lỗi service worker / relative path.
- **Deploy**: `git push origin main` → Vercel auto-deploy.
- **DB schema changes**: vào Supabase dashboard project `icwmtqfpbefntfxboofr` chỉnh tay (SQL editor hoặc Table editor).
- **api/ dependencies**: `npm install` cài `web-push` + `@supabase/supabase-js` cho Vercel serverless functions. Không cần chạy lại khi chỉ sửa HTML/CSS/JS frontend.
- **Line endings**: repo dùng **CRLF** (Windows). Khi append/overwrite file qua tool tự động, giữ nguyên CRLF; mixed-EOL trong cùng file gây git diff noise toàn file.
- **Test OTP trong dev**: Khi `ZALO_ACCESS_TOKEN` chưa set → `api/send-otp.js` log `[DEV] OTP: <code>` ra **Vercel function logs**. Trigger send từ `login-sdt.html`, mở Vercel dashboard → Logs → tìm log của `send-otp` để đọc mã 6 số rồi nhập step 2.

## Architecture

### Page roles

#### `bai10.html` — landing + auth
- Landing page + Google OAuth + role redirect
- Có `<style>` block riêng (~220 dòng) cho hero/stats/features layout — KHÔNG dùng `.card` chuẩn
- `checkUserRole`: email không tìm thấy trong `users` → hiện inline error card (ẩn login UI, card đỏ + nút "Thử lại bằng tài khoản khác" gọi `signOut()` + redirect); **không INSERT**
- `loadStats()`: query `trips`/`users` công khai cho landing stats (sẽ break nếu bật RLS)
- Local `formatStatNumber` ≠ `shared.formatMoney`: bai10 hiện dạng rút gọn `1.2B`/`345M`/`12K`
- OAuth `redirectTo`: `window.location.origin + '/bai10.html'`
- `bai10.html` có nút "Đăng nhập bằng số Zalo" → redirect `login-sdt.html`; `login-sdt.html` có link "Đăng nhập bằng phương thức khác" → redirect `bai10.html`
- Static assets: `logo/logo.PNG` (header logo, max-width 220px), `logo/zalo.png` (icon nút Zalo, 20×20px). Case-sensitive trên Linux/Vercel — `logo.PNG` phải viết hoa đuôi

#### `login-sdt.html` — driver Zalo ZNS OTP login
- Standalone page, **KHÔNG dùng `shared.js`** — chỉ `style.css` (`.btn`/`.btn-full`/`.form-group`/`.toast`) + local `showToast`
- 2 step toggle bằng class `.step-container.active`: step1 nhập SĐT → `POST /api/send-otp`; step2 nhập mã 6 số → `POST /api/verify-otp`
- SĐT sanitize client bằng `.replace(/\D/g, '').trim()` (chỉ giữ số, validate độ dài 9–11). State `currentSdt` được giữ ở module level giữa 2 bước.
- Verify OK → `localStorage.setItem('driver_token', token)` → redirect theo `result.role`: `supervisor`/`owner` → `owner-dashboard.html`; còn lại (driver) → `driver-page.html`. localStorage key luôn là `'driver_token'` dù supervisor cũng dùng — KHÔNG đổi tên.
- `driver-page.html` `logout()` cũng `localStorage.removeItem('driver_token')` + redirect về `login-sdt.html`
- **Hỗ trợ cả driver lẫn supervisor**: `api/send-otp.js` cho phép `role='driver'` hoặc `'supervisor'`; `api/verify-otp.js` trả thêm `role` trong response.
- **Wired into auth**: `requireRole` trong `shared.js` tự xử cả OAuth lẫn Zalo token cho mọi trang dùng nó (`luong-cua-toi.html`, `trip-detail.html`, các trang owner khi supervisor đăng nhập Zalo).

#### `owner-dashboard.html` — owner xem báo cáo + tạo chuyến
- Module-level vars: `currentOwnerProfileId`, `tripsChannel`, `xeList`, `driverList`, `pendingTripData`

**Trip table**
- 7 cột: Ngày | Tuyến đường | Trạng thái | Doanh thu | Chi phí | Lợi nhuận | Chi tiết
- Cột "Trạng thái" (cột 3) tạo thủ công trong `renderTrips()` bằng `row.insertBefore(statusCell, row.children[2])` — badge `🚛 Đang chạy` (`--primary`) / `✅ Hoàn thành` (`--success`); không nằm trong values array
- Mobile ≤600px: ẩn cột 5 (Chi phí) + cột 7 (Lương) qua `nth-child` trong `<style>` block ở `<head>`
- Row highlight: click + touchend → xóa highlight cũ trên `#report-body tr`, set `background:#e3f2fd` cho row vừa tap
- Header có nav đến driver/vehicles; có floating AI chatbot (FAB góc phải) gọi `/api/chat`; `driverMap` trong chatbot context filter `.eq('owner_id', currentOwnerProfileId)`

**Notify panel** (chung cho 4 trang owner)
- `#btn-notify` → `#notify-panel` (fixed top:64px right:16px, click-outside để đóng), 4 toggle (notify_new_trip / notify_complete / notify_expense / notify_maintenance), load/save qua `notify_settings`
- `setupPushNotifications(userId)` chạy mỗi lần login
- JS dependencies (`VAPID_PUBLIC_KEY`, `urlBase64ToUint8Array`, `setupPushNotifications`, `loadNotifySettings`, `saveNotifySetting`, `toggleNotifyPanel`) định nghĩa **local trong mỗi file** (không phải `shared.js`); dùng `currentUserId` (là `auth.profile.id` — luôn là ID của user đang đăng nhập, **không phải** `effectiveOwnerId`) để tránh ghi đè notification settings của admin khi supervisor dùng
- Khi copy notify panel + push setup sang page mới, lấy từ `owner-dashboard.html` (canonical) — không từ pages khác (có thể đã drift theo thời gian)

**Tạo chuyến** (`#new-trip-modal`)
- 2 mode qua tab buttons (`tab-co-dinh`/`tab-theo-km`) + hidden `#nt-loai-luong`; `setTripTab(mode)` toggle UI
- `#nt-tuyen-duong` luôn hiện (tên tuyến cho `co_dinh`; bị bỏ qua ở `theo_km`)
- `#nt-co-dinh-block` (ẩn khi `theo_km`) chứa label "Lương trả theo chuyến cố định (đ)" + `#nt-tien-chuyen` dùng `addDotFormat`; nằm ngay sau div Tuyến đường và trước div flex Xe+Tài xế trong modal DOM
- Mode `theo_km`: gọi `POST /api/maps`, lookup `bang_luong_km` → `luong_chuyen`. Query: `.eq('loai_xe', xe.loai_xe).lte('km_tu', km).or('km_den.gte.'+km+',km_den.is.null').limit(1)` — dùng `.limit(1)` (KHÔNG `.maybeSingle()`), access `rateRows[0]`
- Mode `co_dinh`: `luong_chuyen = tien_co_dinh`, skip Maps API
- `buildDiemRow(containerId)`: input địa chỉ + hidden lat/lng + nút GPS + nút xóa; `parseMapsUrl()` detect Google Maps URL (pattern `/@lat,lng` hoặc `?query=lat,lng`) → auto-fill lat/lng + tô xanh; gõ text thường thì clear lat/lng
- `collectDiems(containerId)`: trả `[{dia_chi, lat, lng}]`
- Waypoints cho Maps API: chỉ giao points (không trộn bốc), `giaoWaypoints = giao.slice(0,-1)`; reorder: `[...optimized_order.map(i => giaoWaypoints[i]), giaoDiems[last]]`
- INSERT `trips` (trang_thai=`'dang_chay'`, trang_thai_giao=`'cho_nhan'`) + bulk INSERT `diem_hanh_trinh` (loại: `'boc_hang'`/`'giao_hang'`) + notify driver

**Preview flow**
- Nút "Tạo chuyến" trong `#new-trip-modal` gọi `previewTrip()` — KHÔNG gọi `submitNewTrip()`
- `previewTrip()`: validate → build `pendingTripData = { xeId, driverId, xe, driver, diem_boc, diem_giao, optimized_order:[], mode, tien_co_dinh }` → đóng new-trip-modal → mở `#preview-trip-modal` → fire-and-forget `fetchKmPreview()` (chỉ khi `theo_km`)
- `fetchKmPreview()`: gọi `/api/maps` async; sau khi resolve guard `if (!pendingTripData) return` (race: user click "← Sửa lại" khi đang chờ); update `#preview-km` + `#preview-km-input`
- `updateLuongPreview()`: đọc `#preview-km-input` → query `bang_luong_km` → hiện `#preview-luong`; gọi từ `fetchKmPreview()` và từ `oninput` trên `#preview-km-input`
- `confirmCreateTrip()`: `co_dinh` → dùng `tien_co_dinh`; `theo_km` → đọc `#preview-km-input`, query lại `bang_luong_km` (không dùng cached value)
- `closePreviewModal()`: đóng preview → mở lại new-trip-modal → `pendingTripData = null`
- Cả 2 modals dùng inline styles (không có `.modal`/`.modal-content` CSS class)

**Local helpers**: `addDotFormat`, `numberToVietnamese` (local, KHÔNG có trong `shared.js`)

**Dead code**: `submitNewTrip()` vẫn còn trong file nhưng không bao giờ được gọi (đã thay bằng preview flow) — có thể xóa an toàn

---

#### `trip-detail.html` — xem chi tiết chuyến (shared owner + driver)
- URL param: `?trip_id=`. Module-level `currentProfile` set trong `initPage()`
- Auth: dùng `requireRole(sb, ['owner', 'driver', 'supervisor'])` — hỗ trợ cả OAuth lẫn Zalo token. `ownerId` lấy thẳng từ `auth.profile.owner_id` (không query DB thêm); owner dùng `profile.id`.
- Driver chỉ xem trip của mình; owner + supervisor xem tất cả trong fleet. `ownerId` cho driver/supervisor: `currentProfile.owner_id` (sẵn trong profile từ `requireRole`).
- Trips query: `.select('*, tai_xe:users!tai_xe_id(full_name), xe:xe(bien_so)')`
- `goBack()`: ưu tiên `document.referrer`, fallback theo `currentProfile.role`; supervisor không có branch riêng → rơi vào `bai10.html` (known gap)
- Driver + dang_chay: thêm/sửa/xóa chi phí inline; ảnh bắt buộc + camera-only + GPS bắt buộc
- Ảnh hóa đơn: `openImageModal(url)` fullscreen overlay (KHÔNG mở tab mới)
- Badge `⚠️ Cũ` cho entries `is_legacy=true`; `📷⚠️` tooltip nếu `anh_realtime === false`
- Cột số tiền prefix: `👤` (driver_paid) / `🏢` (owner_paid) / trống (legacy)
- Add/edit form: select `nguon_tien` bắt buộc (placeholder → validation fail)
- EXPENSE_TYPES: `{ xang, bai_xe, khac }` — `sua_xe` đã bỏ
- Local helpers: `numberToVietnamese`, `addMoneyHint` (copy từ driver-page.html)

---

#### `driver-page.html` — driver xem + thực hiện chuyến
- Driver **không tự tạo chuyến**; owner tạo và assign
- Module-level vars: `currentProfileId`, `currentDriverName`, `currentOwnerId` (từ `users.owner_id`), `currentBienSo`, `currentXeId`, `confirmDiemData`, `confirmDiemPhoto`

**Tabs + queries**
- Tab "Đang chạy": `.eq('trang_thai', 'dang_chay').in('trang_thai_giao', ['cho_nhan', 'dang_thuc_hien'])`
- Tab "Hoàn thành": link đến `trip-detail.html?trip_id=`
- `initPage()` kiểm tra xe assigned: nếu không có xe → red warning card + ẩn `#btn-bao-duong`; nếu có → hiện `#btn-bao-duong`

**Trip card (async)**
- `buildTripCard(trip)` là **async** — query `xe` lấy `xeConfig`, build `diemSection` div (`diem-section-{tripId}`), gọi `buildDiemHanhTrinhSection(tripId).then(...)`, rồi `buildCompleteForm(trip, xeConfig)` synchronously
- `loadActiveTrips()` dùng `for...of` + `await` (không dùng `forEach`) vì `buildTripCard` là async
- `buildCompleteForm(trip, xeConfig)`: hiện `trip.luong_chuyen` cố định từ DB (không tính lại); `btnConfirm.onclick` → `submitComplete(trip.id, trip.luong_chuyen)`
- `submitComplete(tripId, luongChuyen)`: dùng `luongChuyen` trực tiếp (không gọi `calcLuongChuyen`)

**Diem hanh trinh**
- `buildDiemHanhTrinhSection(tripId)` async — query `diem_hanh_trinh` order `thu_tu`, render badge loại (`'boc_hang'`→📦 / `'giao_hang'`→🚩), địa chỉ (GPS link nếu có lat/lng), trạng thái (✅ thumbnail / nút "✓ Xác nhận tại điểm")
- Modal `#confirm-diem-modal`: camera-only + GPS bắt buộc
- `submitConfirmDiem()`: validate photo → GPS → upload (bucket `receipts`) → UPDATE `diem_hanh_trinh` (trang_thai=`'hoan_thanh'`, anh_realtime=true) → nếu 0 pending thì UPDATE `trips.trang_thai_giao='dang_thuc_hien'` → re-render diem section in-place

**Chi phí + bảo dưỡng**
- EXPENSE_TYPES: `{ xang, bai_xe, khac }` — `sua_xe` đã bỏ (dùng `bao_duong`)
- Thêm chi phí: camera-only, `anh_realtime=true`, `is_legacy=false`. Sửa: đổi ảnh → camera-only `anh_realtime=true`; xóa ảnh → `anh_realtime=null`; giữ nguyên → giữ giá trị cũ
- `#btn-bao-duong` → `openMaintenanceModal()` → INSERT `bao_duong` + GPS bắt buộc + `notifyOwner('maintenance', ...)`

**Local helpers**: `numberToVietnamese(n)` (capitalize first letter), `addMoneyHint(input)` (dấu chấm nghìn, raw digits trong `input.dataset.rawValue`). Submit functions đọc `dataset.rawValue || .value`

**Dead code**: `#btn-new-trip` và form tạo chuyến tồn tại trong HTML nhưng `initPage()` không bao giờ show — có thể xóa an toàn

---

#### `driver.html` — owner quản lý tài xế + công nợ
- Bảng 5 cột: Họ và tên | SĐT | Xe đang chạy | Đang giữ | Thao tác — không có month filter, không có PDF
- `loadDrivers()`: build `xeMap[tai_xe_id → bien_so]` từ xe có non-null `tai_xe_id`, dùng `calcDriverBalance()`
- **Balance** = Σ`tam_ung`(hoàn thành) + Σ`tam_ung_thang` − Σ`hoan_ung`(hoàn thành) − Σ`chi_phi_driver_paid`(ALL trips, non-legacy); đỏ nếu > 0, xanh nếu ≤ 0

**Modals**
- Click tên tài xế → `openTripsModal(driverId, driverName, driverEmail, driverSdt, driverBienSo)` — modal 5 tham số, info section + month filter nội bộ + nút xóa tài xế (async: `await deleteDriver()`, chỉ close modal khi return `true`)
- Click "Đang giữ" → `openBalanceModal(driverId, driverName)`: debt ledger timeline
  - Entries `{ date, type, label, amount, sign }`: `trip_advance` (+1), `refund` (-1), `advance` (+1), `expense_driver` (-1)
  - Date parse: local methods `getDate/getMonth/getFullYear` — KHÔNG dùng UTC methods
  - Bảng 5 cột: Ngày | Loại | Mô tả | Số tiền | Số dư; badge `expense_driver`: `background:#ffebee;color:#c62828`
  - Dòng tổng "Tổng đang giữ" với border-top dày
- `+ Tạm ứng` → `openAdvanceModal()` → INSERT `tam_ung_thang`
- `addDriver()`: check trùng email + SĐT qua `maybeSingle()` trước INSERT, include `owner_id: ownerProfileId`

---

#### `vehicles.html` — owner quản lý xe + bảo dưỡng
- Click biển số → modal đổi tài xế (kiểm tra tài xế đang lái xe khác); dùng `formatBienSo(s)` khi hiển thị và blur
- `changeStatus(id, status, taiXeId)`: có tài xế → `hoat_dong ↔ bao_duong`; không tài xế → `tam_nghi ↔ bao_duong`
- "📋 Chuyến" → modal query bằng `xe_id` (KHÔNG phải `tai_xe_id`) — lấy đúng chuyến của xe qua mọi tài xế
- `nam_sx` và `luong_co_ban` tồn tại trong DB nhưng ẩn khỏi UI; `tai_xe_id` unique enforce ở app, không có DB constraint
- Bảng 7 cột: Biển số | Loại | Cách tính lương | Giá trị | Tài xế | Trạng thái | Hành động

**Inline salary editing**
- 2 cột: "Cách tính lương" (select `khoan_chuyen`/`phan_tram_doanh_thu`) + "Giá trị" (input, suffix `đ`/`%` theo mode)
- Onchange select → auto-save + reset `gia_tri_luong=0` vào DB. Blur input → validate pct 0–100 + save
- Switch mode: phải set `input.dataset.rawValue = ''` explicitly (programmatic change không trigger input event)
- Form "Thêm xe mới" cũng có 2 field tương ứng; onchange dropdown trong form phải clear value+rawValue+suffix

**Bảo dưỡng**
- `PRESET_PARTS`: array 21 bộ phận hardcode (file-level const)
- Form có `maint-bophan-{id}` (text input với datalist `bophan-suggestions-{id}`) + `maint-ngaytiep-{id}` (date)
- `loadMaintenance()`: populate datalist từ lịch sử + PRESET_PARTS (unique merge); filter `<select>` theo `bo_phan`
- Bảng history join: `.select('*, tai_xe:users!tai_xe_id(full_name)')` — "Người nhập": `'driver'` → `👤 {full_name}`, `'owner'` → `🏢 Chủ xe`
- Cột Mô tả append `→ Xem chuyến` (mở tab mới) nếu `trip_id` có giá trị
- `loadVehicles()` query `bao_duong.ngay_tiep_theo`; badge: `⚠️ N ngày` (0–7 ngày), `🔴 Quá hạn N ngày` (< 0)

**Bảng lương km**
- Card riêng cho owner define `bang_luong_km` theo `loai_xe` + km range
- `init()` calls `await loadKmRates()` + `addDotFormat(#km-so-tien)`

---

#### `luong-thang.html` — owner quản lý bảng lương tháng + PDF
- Toggle `cho_phep_xem_luong` trên `users` (owner row) cho phép driver xem lương
- `fetchLuongData(thangStr)` chỉ **fetch raw**: drivers, xe (`.select('id, bien_so')`), upsert `luong_thang` (auto-INSERT nếu chưa có, `luong_co_ban_snapshot: 0`, `ap_dung_luong_co_ban: false`), query trips theo tháng. **Per-driver aggregation (Σ luong_chuyen, Σ tam_ung, Σ hoan_ung, soChuyen, thuc_linh) compute trong `loadLuong()` forEach** — không nằm trong fetchLuongData. PDF render (`printPayslip`/`printAllPayslips`) cũng gọi `fetchLuongData` rồi loop tính lại trước khi build payslip.
- Bảng 12 cột: Tên | Biển số | Lương CB | Chuyến | Phụ cấp | Thưởng | Tạm ứng | Hoàn ứng | Khấu trừ | THỰC LĨNH | Sửa | In phiếu
- Cột Chuyến hiển thị `${soChuyen} chuyến / ${formatMoney(tong_luong_chuyen)}` (đếm + tổng tiền cùng cell); PDF payslip giữ label `Lương chuyến (${trips.length} chuyến)` riêng
- Lương CB: hiện `formatMoney(luong_co_ban_snapshot)` khi `ap_dung_luong_co_ban=true`, còn lại hiện `'—'`
- Công thức: `luong_cb_apply = ap_dung_luong_co_ban ? luong_co_ban_snapshot : 0`; `thuc_linh = luong_cb_apply + tong_luong_chuyen + phu_cap + thuong - tong_tam_ung + tong_hoan_ung - khau_tru`
- THỰC LĨNH highlight: `idx === 9` trong cellValues (0-indexed)
- PDF: `buildPayslipHTML(luongRow, driver, xe, trips, thangStr)` → DOM element (width 595px, inline style); `printPayslip()` dùng `html2canvas` (scale 2) + `jspdf.jsPDF`; `printAllPayslips()` tạo 1 PDF nhiều trang; dòng "Lương cơ bản" chỉ xuất hiện trong PDF khi `ap_dung_luong_co_ban=true`
- Nút "🖨️ In tất cả" ở filter bar + hamburger menu (`menu-print-all`); header không còn nút này
- CDN: `jspdf@2.5.1` (UMD) → global `jspdf.jsPDF`; `html2canvas@1.4.1` → global `html2canvas`
- Local helper `slugify()`: `.replace(/đ/g,'d').replace(/Đ/g,'d').normalize('NFD').replace(/[̀-ͯ]/g,'')...`
- Edit modal cập nhật `ap_dung_luong_co_ban` (`.notify-row` toggle `#edit-ap-dung-cb`), `luong_co_ban_snapshot` (`#edit-luong-cb`), `phu_cap`, `thuong`, `khau_tru`, `ghi_chu`. `ownerProfileId` = `auth.profile.id`
- `#edit-luong-cb` nằm trong `#edit-luong-cb-group`: ẩn khi toggle OFF, hiện khi ON — `toggleLuongCbVisibility()` được gọi cả khi `onchange` và khi `openEditModal()` sau khi set `.checked`

---

#### `luong-cua-toi.html` — driver xem lương của mình
- Permission gate: query `users.owner_id` của driver → query `users.cho_phep_xem_luong` của owner; nếu false/null → hiện card đỏ "chưa bật"
- `initPage()` tạo 2 child div `#balance-container` + `#luong-container` bên trong `#main-content`; gọi `loadBalanceCard()` (không await) + `loadLuong()` (await)
- **Balance card** (`#balance-container`): hiện số dư bằng `calcDriverBalance()` — màu warning nếu > 0 (đang giữ), success nếu < 0 (chủ nợ)
- `#luong-container`: danh sách tháng dạng card, thực lĩnh lớn, nút Chi tiết → modal breakdown
- `currentProfileId` = `auth.profile.id`

---

#### `supervisors.html` — owner quản lý giám sát viên (Phase A)
- Auth: `requireRole(sb, 'owner')` — CHỈ owner gốc, supervisor không vào được
- Chức năng: danh sách supervisor (query `users` `.eq('role','supervisor').eq('owner_id', ownerProfileId)`), thêm (INSERT với `role:'supervisor'`), xóa có confirm
- Form thêm supervisor có 3 field: email (bắt buộc), SĐT (tùy chọn, dùng cho Zalo OTP), họ và tên (bắt buộc). `addSupervisor()` check trùng email + trùng SĐT (nếu có) trước khi INSERT; SĐT insert là `null` nếu để trống (KHÔNG empty string — UNIQUE constraint).
- **Supervisor hỗ trợ 2 phương thức đăng nhập**: Google OAuth → `bai10.html` redirect sang `owner-dashboard.html`; Zalo OTP → `login-sdt.html` (cần có `sdt` trong `users`) → redirect `owner-dashboard.html`.
- **Phase A — read-only mềm**: supervisor thấy đúng fleet của admin (4 trang: owner-dashboard, driver, vehicles, luong-thang) nhưng mọi nút tạo/sửa/xóa bị ẩn bằng **CSS role-gating pattern** (`.owner-only` ẩn mặc định trong `style.css`; JS thêm `body.role-owner` cho owner để gỡ ẩn) — xem chi tiết trong section CSS conventions. Tránh FOUC vì element ẩn ngay khi parse, không chờ JS hide-after-render. `vehicles.html` còn vài dynamic cell (`loadVehicles()` row builder) vẫn dùng conditional `currentRole === 'supervisor'` branches cho plate/salary/action cells — chủ ý không migrate sang `.owner-only` (post-auth render nên không có FOUC, rewrite risky vì intertwined với inline-salary-edit). RLS chưa bật → đây là phòng thủ UI thuần, chưa phải server-side. Phase B (RLS) là milestone riêng.
- Pattern effectiveOwnerId: `supervisor ? profile.owner_id : profile.id` — gán vào biến owner-id của trang để mọi query `.eq('owner_id', ...)` tự đúng fleet admin
- `currentUserId = auth.profile.id` (ID của người đang đăng nhập) dùng riêng cho `setupPushNotifications` và `loadNotifySettings`/`saveNotifySetting` — không dùng `effectiveOwnerId` để tránh đụng notification settings của admin

---

#### `sw.js` + `manifest.json` — PWA
- Chỉ register từ `bai10.html`
- STATIC_ASSETS: `bai10.html`, `style.css`, `manifest.json`, icons — **`shared.js` và tất cả admin pages không được pre-cache**, chỉ dynamic-cache khi navigate tới
- Khi deploy thay đổi cho bất kỳ file nào trong STATIC_ASSETS, phải bump `CACHE_NAME` trong `sw.js` (hiện tại `van-tai-v28`) để invalidate cache cũ
- Push handler + notificationclick handler (focus tab cũ hoặc mở tab mới tới URL trong `notification.data.url`)

---

### shared.js (BẮT BUỘC dùng cho mọi page mới)
```
createSb()              → tạo Supabase client với URL+anon key built-in
formatBienSo(s)         → chuẩn hóa biển số thành dạng "XX-NNN.NN" (uppercase, strip separators)
formatMoney(n)          → "1.234.567 đ" (vi-VN locale + đ ký tự)
formatDate(timestamptz) → "HH:MM - DD/MM/YY" (nhận ISO string hoặc timestamptz từ Supabase)
getUserRole(sb, email)  → role string hoặc null
getUserProfile(sb, email) → { id, role, owner_id } hoặc null
requireRole(sb, role)   → đảm bảo session + role khớp; redirect bai10 nếu không.
                          Nhận string (cũ) hoặc array (mới): `requireRole(sb, ['owner', 'supervisor'])`.
                          Trả { user, profile } hoặc null.
setupLogoutListener(sb) → tự redirect bai10 khi logout từ tab khác.
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
- CSS variables ở `:root` của `style.css`: `--primary #1565c0`, `--danger #e74c3c`, `--success #27ae60`, `--warning #e67e22`, `--bg #f0f2f5`, `--white #ffffff`, `--border #e0e0e0`, `--text #444`, `--text-muted #888`, `--shadow`, `--radius 12px`, `--radius-sm 8px`. **`--card-bg` và `--bg-secondary` KHÔNG tồn tại** — dùng `--white` và `--bg` thay thế.
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

Tất cả dùng ESM (`import`/`export default`). `package.json` khai báo `"type": "module"`.

- **`api/chat.js`** — pure proxy SSE tới Anthropic API; model, system prompt và messages đều đến từ `req.body` (do `owner-dashboard.html` gửi), không có gì hardcode server-side. Env: `ANTHROPIC_API_KEY`.
- **`api/maps.js`** — POST `{ origin, destination, waypoints? }` proxy tới VietMap APIs. `origin`/`destination`/waypoints đều là `{ dia_chi?, lat?, lng? }` — nếu đã có lat+lng thì dùng luôn (skip geocode), fallback geocode qua VietMap Search v3. Geocode origin trước (không có focus), rồi geocode tất cả điểm còn lại song song với origin làm focus. 0 waypoints → VietMap Route v1.1 (2 điểm); có waypoints → VietMap TSP v3 (`roundtrip=false&sources=first&destinations=last`). Trả `{ km, optimized_order }` hoặc `{ error }`. km làm tròn 1 chữ số thập phân (intentional cho `bang_luong_km` lookup). `optimized_order` luôn là original order (VietMap TSP không trả index array). Env: `VIETMAP_API_KEY`.
- **`api/subscribe.js`** — POST `{ user_id, subscription }`, upsert vào `push_subscriptions`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- **`api/notify.js`** — POST `{ owner_id, type, payload }`. Check `notify_settings` bằng `.maybeSingle()` (NULL row = tất cả bật), gửi push qua `web-push`, tự xóa subscription nếu 410. Push payload JSON bao gồm `title`, `body`, `icon`, và `url` (dùng trong `sw.js` notificationclick). URL logic: nếu `payload.trip_id` có giá trị → `/trip-detail.html?trip_id={trip_id}`; ngược lại nếu `type === 'maintenance'` → `/vehicles.html`; còn lại → `/owner-dashboard.html`. `type` và payload fields bắt buộc:
  - `'new_trip'`: `{ driver_name, bien_so, tuyen_duong, trip_id }`
  - `'complete'`: `{ driver_name, bien_so, tuyen_duong, trip_id }`
  - `'expense'`: `{ driver_name, bien_so, loai, so_tien, trip_id }`
  - `'maintenance'`: `{ driver_name, bien_so, bo_phan, chi_phi, trip_id }`
  
  Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- **`api/send-otp.js`** — POST `{ sdt }` (SĐT `0901234567`, normalize chỉ `.trim()`). Gửi OTP 6 số cho driver login qua Zalo ZNS template `586307`. Đã có frontend wiring (`login-sdt.html`), verify (`verify-otp.js`), và session check (`verify-session.js`). Flow: validate sdt → check `users` (phải tồn tại + `role='driver'`, nếu không trả 404/403) → rate-limit lớp 1 (60s giữa 2 lần xin mã) → rate-limit lớp 2 (≤5 mã/24h) → set `used=true` mọi mã cũ → tạo mã bằng `crypto.randomInt(100000, 1000000)` (crypto-secure, luôn 6 số) → INSERT `otp_codes` → gọi `sendZaloZns()` (hàm `sendZaloZns()` gọi `sendZnsWithToken(phone, code, token)` — POST `business.openapi.zalo.me/message/template`, header `access_token`, body `{phone, template_id:'586307', template_data:{otp}}`; nếu Zalo trả `error === -216` (token hết hạn) → `refreshZaloToken()` (POST `oauth.zaloapp.com/v4/oa/access_token`, header `secret_key`, body form-urlencoded `grant_type=refresh_token&app_id&refresh_token`) → retry 1 lần). **TUYỆT ĐỐI không trả `code` về client** (chỉ `{ ok: true }`). Tradeoff đã biết: 404/403/200 khác nhau → cho phép phone enumeration (chấp nhận để UX báo lỗi rõ). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_APP_ID`, `ZALO_APP_SECRET`.
  - **Auto-refresh caveat**: dùng `process.env` runtime (không persist) → mỗi cold start dùng token cũ, chỉ refresh khi bị reject. Refresh_token Zalo đổi mỗi lần dùng nhưng code không lưu lại refresh_token mới — known limitation, refresh chỉ chạy được trong phạm vi 1 request.
  - **Dev mode**: khi `ZALO_ACCESS_TOKEN` chưa set → log `[DEV] OTP: <code>` ra Vercel logs, không gửi ZNS thật.
  - **Đã tạo trên Supabase. Schema:** `(id uuid PK, sdt text, code text, expires_at timestamptz, used bool DEFAULT false, wrong_attempts int DEFAULT 0, created_at timestamptz DEFAULT now())`. Cột `created_at DEFAULT now()` bắt buộc — cả 2 rate-limit dựa vào nó và code không insert thủ công.
- **`api/verify-otp.js`** — POST `{ sdt, code }`. Verify OTP → tạo session token cho driver login. Flow: validate (`sdt` phải `typeof === 'string'`; `code = String(rawCode ?? '').trim()` rồi match `/^\d{6}$/`) → query `otp_codes` mã chưa dùng mới nhất (`.eq('used', false).order('created_at', { ascending: false }).limit(1)`, access `rows[0]` — KHÔNG `.maybeSingle()`) → check `expires_at` < now → check `wrong_attempts >= 5` → so sánh `code` (sai → UPDATE `wrong_attempts + 1` theo kiểu đọc-rồi-ghi, **không atomic**) → query `users.id` by `sdt` (`.maybeSingle()`) → mark `used=true` → tạo token `crypto.randomBytes(32).toString('hex')` → INSERT `sessions {token, user_id}` → trả `{ ok: true, token }`. **Session KHÔNG có expiry** (chủ ý — verify-session cũng không check). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
  - **Đã tạo trên Supabase. Schema:** `CREATE TABLE sessions (token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now())`. FK phải → `public.users` (KHÔNG `auth.users`); `token` phải PK/UNIQUE để verify-session `.maybeSingle()` an toàn.
  - **`users.sdt` đã có UNIQUE constraint**: lookup ở step query `users.id` dùng `.maybeSingle()` an toàn. (NULL được phép trùng trong UNIQUE Postgres nên owner row `sdt=NULL` không sao.)
- **`api/verify-session.js`** — POST `{ token }`. Verify session token của driver và trả về thông tin user profile tương ứng. Flow: validate `token` → query `sessions` kết hợp join `users!user_id(id, role, full_name, sdt, owner_id)` để lấy profile của user đang liên kết với token session đó. Không kiểm tra expiry. Trả về thông tin profile định dạng JSON: `{ id, role, full_name, sdt, owner_id }`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

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
| `SUPABASE_URL` | `api/subscribe.js`, `api/notify.js`, `api/send-otp.js`, `api/verify-otp.js` |
| `SUPABASE_SERVICE_KEY` | `api/subscribe.js`, `api/notify.js`, `api/send-otp.js`, `api/verify-otp.js` |
| `VAPID_SUBJECT` | `api/notify.js` |
| `VAPID_PUBLIC_KEY` | `api/notify.js` |
| `VAPID_PRIVATE_KEY` | `api/notify.js` |
| `ZALO_ACCESS_TOKEN` | `api/send-otp.js` (Zalo OA access token — bỏ trống để dùng dev mode log) |
| `ZALO_REFRESH_TOKEN` | `api/send-otp.js` |
| `ZALO_APP_ID` | `api/send-otp.js` |
| `ZALO_APP_SECRET` | `api/send-otp.js` |

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
                -- luong_co_ban: tồn tại trong DB nhưng ẩn khỏi UI vehicles.html (không còn dùng trong INSERT/UPDATE); owner nhập lương cơ bản trực tiếp qua luong_thang.luong_co_ban_snapshot
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

  -- luong_thang: thêm toggle lương cơ bản (bỏ công thức ngày công)
  ALTER TABLE luong_thang ADD COLUMN IF NOT EXISTS ap_dung_luong_co_ban bool DEFAULT false;
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
