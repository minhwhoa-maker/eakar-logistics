# Page roles — chi tiết từng trang

> Tách từ `CLAUDE.md` để giảm context. Đây là mô tả chi tiết hành vi từng trang HTML.
> Các convention chung (shared.js, route-pricing.js, validate-diem.js, CSS, auth, Database) vẫn ở `CLAUDE.md`.

#### `bai10.html` — landing + auth
- Landing page + Google OAuth + role redirect + **PWA cold-start router**
- Có `<style>` block riêng (~220 dòng) cho hero/stats/features layout — KHÔNG dùng `.card` chuẩn
- `checkUserRole`: email không tìm thấy trong `users` → hiện inline error card (ẩn login UI, card đỏ + nút "Thử lại bằng tài khoản khác" gọi `signOut()` + redirect); **không INSERT**
- `loadStats()`: query `trips`/`users` công khai cho landing stats (sẽ break nếu bật RLS)
- Local `formatStatNumber` ≠ `shared.formatMoney`: bai10 hiện dạng rút gọn `1.2B`/`345M`/`12K`
- OAuth `redirectTo`: `window.location.origin + '/bai10.html'`
- `bai10.html` có nút "Đăng nhập bằng số Zalo" → redirect `login-sdt.html`; `login-sdt.html` có link "Đăng nhập bằng phương thức khác" → redirect `bai10.html`
- Static assets: `logo/logo.PNG` (header logo, max-width 220px), `logo/zalo.png` (icon nút Zalo, 20×20px). Case-sensitive trên Linux/Vercel — `logo.PNG` phải viết hoa đuôi
- **`checkUser()` — cold-start router 2-auth**: `manifest.json` `start_url: ./bai10.html` → PWA luôn về bai10. Khi `getSession()` trả null, hàm kiểm tra `localStorage.driver_token` trước khi `showLogin()`: có token → `POST /api/verify-session`; `200` → `window.location.replace()` theo role; `4xx` → xóa token + `showLogin()`; `5xx`/network throw → **giữ token** + `showLogin()` (tránh xóa token khi chỉ rớt mạng). `onAuthStateChange` chỉ bind khi không có token hoặc token chết 4xx. KHÔNG dùng `requireRole()` ở đây — nó redirect ngược về bai10 khi fail → vòng lặp vô hạn.

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

**Card "Lãi/lỗ theo xe"** (`#lailo-section`, nằm giữa `.table-scroll` của trip table và `#status-message`)
- Data gom **trong `loadTrips`** (không subscribe riêng — re-render mỗi khi `tripsChannel` fire). `start`/`endStr` được hoist `let ... = null` ra trước block `if(month)` để cụm bao_duong tái dùng filter tháng. Cụm `[query bao_duong → query xe → gom perXe → renderLaiLo]` đặt **ngay sau `setTotals(...)`, TRƯỚC nhánh `if (trips.length === 0) return`** — nên card vẫn render khi tháng 0 chuyến nhưng có bảo dưỡng
- `bao_duong` query (`xe_id, chi_phi`, filter `.eq('owner_id', currentOwnerProfileId)`); nếu có `month` thì `.gte('ngay', start).lt('ngay', endStr)` — `bao_duong.ngay` là **date column** nên dùng `start`/`endStr` dạng `'YYYY-MM-DD'` KHÔNG suffix `T00:00:00` (khác trip table lọc `ngay_bat_dau` timestamptz). Hai hệ quy chiếu ngày khác nhau — chấp nhận
- `perXe` gom theo `xe_id`: `{ doanhThu, chiPhiChuyen, luong, baoDuong }`; trips không gắn xe + bao_duong không gắn xe gom vào key `'__no_xe__'` (nhãn "Không gắn xe"). Mọi phép cộng bọc `toNumber()`
- `renderLaiLo(perXe, xeMap)`: guard `Object.keys(perXe).length===0` → clear section + return (ẩn card khi không có data nào). Dựng `.stat-card` + `.table-scroll wide`; cột Biển số | Doanh thu | Chi phí | Lãi/lỗ; **chi phí gộp** = chiPhiChuyen + luong + baoDuong; lãi = doanhThu − chiPhi (màu `--success`/`--danger`). Sort lãi tăng dần (lỗ nặng lên đầu). Dòng TỔNG in đậm + `border-top`. `formatBienSo()` cho biển số (KHÔNG áp cho key `'__no_xe__'`)

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
- **Paste hội thoại** (`#nt-conv-box`): owner paste đoạn chat Zalo vào `#nt-conv-text` → bấm "✨ Tách thành các điểm" → `handleConvPaste()` gọi `POST /api/parse-hoi-thoai` → nhận `{ diems:[{loai, ten, sdt, dia_chi, ghi_chu}] }` → clear list cũ → gọi `addDiemBoc()`/`addDiemGiao()` cho mỗi phần tử → `fillLastRow(containerId, d)` điền field vào row vừa tạo → `checkBocDauDu()` + `autoFillTuyen()`. `fillLastRow` nhận `{ten, sdt, dia_chi, ghi_chu}` (tên field từ LLM, KHÔNG phải `ten_lien_he`/`sdt_lien_he`).
- **`autoFillTuyen()`** (async): sau khi địa chỉ bốc/giao thay đổi → gọi `deriveTuyen()` từ `route-pricing.js` → nếu nhận ra cả 2 tỉnh: điền `#nt-tuyen-duong` (nếu chưa edit tay) + fetch `GET /api/route-salary?maTuyen=...` (Supabase JWT header) → điền `#nt-tien-chuyen` (nếu chưa edit tay, chỉ `co_dinh` mode). **Cờ `_manuallyEdited`**: mỗi ô tuyến + lương có cờ DOM riêng; set `true` khi user gõ tay, reset `false` khi mở modal mới (`openNewTripModal`). Chống đè sau await: double-check `_manuallyEdited` lần 2 sau khi fetch resolve.
- `buildDiemRow(containerId)`: card-style layout (`flex-direction:column`, viền trái màu cam cho bốc / xanh cho giao). Các input: `.diem-ten` (tên liên hệ, bắt buộc), `.diem-sdt` (SĐT, `type=tel`, `inputMode=numeric`, `maxLength=10`, chỉ nhận số, bắt buộc), `.diem-dia-chi` (địa chỉ, text tự do — không phải URL) + hidden lat/lng + nút GPS, `.diem-ghichu` (ghi chú, tuỳ chọn), nút xóa ✕ align-right. `parseMapsUrl()` detect Google Maps URL (pattern `/@lat,lng` hoặc `?query=lat,lng`) → gọi `setCoord(lat, lng)` + clear `addrInput.value`; gõ text thường → chỉ reset `addrInput.style.color` (KHÔNG clear lat/lng). `setCoord(lat, lng)`: ghi latInput/lngInput, render badge "📍 Đã ghim toạ độ ✕" vào `coordSpan` — nút ✕ mới là cách duy nhất xóa tọa độ đã pin. GPS button cũng gọi `setCoord()`. Input listener của `addrInput` gọi `autoFillTuyen()` sau mỗi thay đổi.
- `collectDiems(containerId)`: trả `[{dia_chi, lat, lng, ten_lien_he, sdt_lien_he, ghi_chu}]`
- `checkBocDauDu()`: progressive disclosure — ẩn `#nt-giao-block` cho đến khi row bốc đầu tiên có đủ `ten_lien_he` + `sdt_lien_he` + `dia_chi`. Được gọi từ input listeners của 3 field trên và từ `delBtn` của bốc row (chỉ khi `row.remove()` thật sự xảy ra — bên trong guard `container.children.length > 1`). Dùng `display=''` khi hiện (revert về UA default, ổn với flex container).
- `#diem-cols-wrapper`: div bọc block bốc + `#nt-giao-block`, `display:flex;flex-direction:column;gap:16px`, mỗi block `flex:1;min-width:0`. `<head>` còn `@media (max-width:600px) { #diem-cols-wrapper { flex-direction:column } }` nhưng đây là **dead code** (desktop đã là column) — có thể xóa an toàn.
- Waypoints cho Maps API: chỉ giao points (không trộn bốc), `giaoWaypoints = giao.slice(0,-1)`; reorder: `[...optimized_order.map(i => giaoWaypoints[i]), giaoDiems[last]]`
- INSERT `trips` (trang_thai=`'dang_chay'`, trang_thai_giao=`'cho_nhan'`) + bulk INSERT `diem_hanh_trinh` (loại: `'boc_hang'`/`'giao_hang'`) + notify driver

**Preview flow**
- Nút "Tạo chuyến" trong `#new-trip-modal` gọi `previewTrip()` — KHÔNG gọi `submitNewTrip()`
- `previewTrip()`: validate (địa chỉ + `ten_lien_he` + `sdt_lien_he` bắt buộc cho mọi điểm) → build `pendingTripData = { xeId, driverId, xe, driver, diem_boc, diem_giao, optimized_order:[], mode, tien_co_dinh }` → đóng new-trip-modal → mở `#preview-trip-modal` → fire-and-forget `fetchKmPreview()` (chỉ khi `theo_km`)
- `fetchKmPreview()`: gọi `/api/maps` async; sau khi resolve guard `if (!pendingTripData) return` (race: user click "← Sửa lại" khi đang chờ); update `#preview-km` + `#preview-km-input`
- `updateLuongPreview()`: đọc `#preview-km-input` → query `bang_luong_km` → hiện `#preview-luong`; gọi từ `fetchKmPreview()` và từ `oninput` trên `#preview-km-input`
- `confirmCreateTrip()`: `co_dinh` → dùng `tien_co_dinh`; `theo_km` → đọc `#preview-km-input`, query lại `bang_luong_km` (không dùng cached value). Sau khi trip insert thành công + `mode === 'co_dinh'` + `luong_chuyen > 0`: fire-and-forget `POST /api/route-salary` để nhớ giá tuyến này cho lần sau (skip nếu `maTuyen` chứa `'XX'`).
- `closePreviewModal()`: đóng preview → mở lại new-trip-modal → `pendingTripData = null`
- Cả 2 modals dùng inline styles (không có `.modal`/`.modal-content` CSS class)
- Modal `#new-trip-modal` có nút ✕ góc phải đóng modal, tái dùng `closeNewTripModal()` có sẵn (không tạo hàm mới); KHÔNG set `pendingTripData=null` trong nút ✕ (nút chỉ tồn tại khi `pendingTripData` đã null sẵn)

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
- `buildDiemHanhTrinhSection(tripId)` async — query `diem_hanh_trinh` order `thu_tu`, render badge loại (`'boc_hang'`→📦 / `'giao_hang'`→🚩), địa chỉ (GPS link nếu có lat/lng), contact row (tên + link `tel:` SĐT + ghi chú italic) chỉ render khi field có giá trị (null guard cho records cũ), trạng thái (✅ thumbnail / nút "✓ Xác nhận tại điểm")
- Modal `#confirm-diem-modal`: camera-only + GPS bắt buộc
- `submitConfirmDiem()`: validate photo → GPS → upload (bucket `receipts`) → UPDATE `diem_hanh_trinh` (trang_thai=`'hoan_thanh'`, anh_realtime=true) → nếu 0 pending thì UPDATE `trips.trang_thai_giao='dang_thuc_hien'` → re-render diem section in-place

**Chi phí + bảo dưỡng**
- EXPENSE_TYPES: `{ xang, bai_xe, khac }` — `sua_xe` đã bỏ (dùng `bao_duong`)
- Thêm chi phí: camera-only, `anh_realtime=true`, `is_legacy=false`. Sửa: đổi ảnh → camera-only `anh_realtime=true`; xóa ảnh → `anh_realtime=null`; giữ nguyên → giữ giá trị cũ
- `#btn-bao-duong` → `openMaintenanceModal()` → INSERT `bao_duong` + GPS bắt buộc + `notifyOwner('maintenance', ...)`
- Modal bảo dưỡng có nút "✨ Tự điền loại & bộ phận" (`#btn-maint-ai`) → `autoFillMaintLoai()`: đọc `#maint-mota`, `POST /api/phan-loai-bao-duong` → set `#maint-loai` (nếu loai ∈ enum) + `#maint-bophan` (nếu non-rỗng). Disable nút + đổi text "Đang xử lý..." trong try/finally; lỗi/`!r.ok`/network → toast nhẹ "Không gợi ý được, chọn tay nhé", KHÔNG chặn. Tài xế review tay, không validate thêm client.

**Local helpers**: `numberToVietnamese(n)` (capitalize first letter), `addMoneyHint(input)` (dấu chấm nghìn, raw digits trong `input.dataset.rawValue`). Submit functions đọc `dataset.rawValue || .value`

**Dead code**: `#btn-new-trip` và form tạo chuyến tồn tại trong HTML nhưng `initPage()` không bao giờ show — có thể xóa an toàn

**`setupLogoutListener(sb)` đã bị comment out** trong `driver-page.html` (intentional). Driver/supervisor Zalo không có Supabase session → `onAuthStateChange` bắn `SIGNED_OUT` khi cold-start → văng khỏi app. Nếu muốn bật lại, cần đảm bảo `setupLogoutListener` không văng Zalo user.

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
- `loadMaintenanceModal()`: trước bảng lịch sử phẳng, render `summaryContainer` "📊 Tổng hợp theo bộ phận" — rollup group theo `bo_phan` (null → nhóm "Khác"), mỗi nhóm `{soLan, lanGanNhat, tongChiPhi, cacNgay[]}`, sort `soLan` desc. Date parse thủ công từ `YYYY-MM-DD` (KHÔNG dùng `formatDate` để né bug timezone của `date` column). Badge cảnh báo `⚠️ thay lại sau N ngày` (màu `--warning`) khi nhóm có `soLan >= 2` và khoảng cách giữa 2 lần gần nhất `> 0 && < NGUONG_THAY_LAI` (30 ngày). Badge chỉ hiển thị, KHÔNG chặn/kết luận.
- Bảng history join: `.select('*, tai_xe:users!tai_xe_id(full_name)')` — "Người nhập": `'driver'` → `👤 {full_name}`, `'owner'` → `🏢 Chủ xe`
- Cột Mô tả append `→ Xem chuyến` (mở tab mới) nếu `trip_id` có giá trị
- Cột Mô tả render badge hình thức sửa inline (🏭 Tại gara nền `#e8f5ed` / 🔧 Lưu động nền `#fdf0e3`); `null`/giá trị lạ không render. **Gotcha**: reset pattern 2 form bảo dưỡng bất đối xứng — `driver-page.html` reset on-open (`openMaintenanceModal`), `vehicles.html` reset on-success; chưa đồng bộ (scope creep, để dành)
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
- **Supervisor hỗ trợ 2 phương thức đăng nhập**: Google OAuth → `bai10.html` redirect sang `owner-dashboard.html`; Zalo OTP → `login-sdt.html` (cần có `sdt` trong `users`, `api/send-otp.js` cho phép `role IN ('driver','supervisor')`, supervisor login Zalo có `driver_token` trong localStorage giống driver) → redirect `owner-dashboard.html`.
- **Phase A — read-only mềm**: supervisor thấy đúng fleet của admin (4 trang: owner-dashboard, driver, vehicles, luong-thang) nhưng mọi nút tạo/sửa/xóa bị ẩn bằng **CSS role-gating pattern** (`.owner-only` ẩn mặc định trong `style.css`; JS thêm `body.role-owner` cho owner để gỡ ẩn) — xem chi tiết trong section CSS conventions của `CLAUDE.md`. Tránh FOUC vì element ẩn ngay khi parse, không chờ JS hide-after-render. `vehicles.html` còn vài dynamic cell (`loadVehicles()` row builder) vẫn dùng conditional `currentRole === 'supervisor'` branches cho plate/salary/action cells — chủ ý không migrate sang `.owner-only` (post-auth render nên không có FOUC, rewrite risky vì intertwined với inline-salary-edit). RLS chưa bật → đây là phòng thủ UI thuần, chưa phải server-side. Phase B (RLS) là milestone riêng.
- Pattern effectiveOwnerId: `supervisor ? profile.owner_id : profile.id` — gán vào biến owner-id của trang để mọi query `.eq('owner_id', ...)` tự đúng fleet admin
- `currentUserId = auth.profile.id` (ID của người đang đăng nhập) dùng riêng cho `setupPushNotifications` và `loadNotifySettings`/`saveNotifySetting` — không dùng `effectiveOwnerId` để tránh đụng notification settings của admin

---

#### `sw.js` + `manifest.json` — PWA
- Chỉ register từ `bai10.html`
- STATIC_ASSETS: `bai10.html`, `style.css`, `manifest.json`, icons — **`shared.js` và tất cả admin pages không được pre-cache**, chỉ dynamic-cache khi navigate tới
- Khi deploy thay đổi cho bất kỳ file nào trong STATIC_ASSETS, phải bump `CACHE_NAME` trong `sw.js` (hiện tại `van-tai-v40`) để invalidate cache cũ
- Push handler + notificationclick handler (focus tab cũ hoặc mở tab mới tới URL trong `notification.data.url`)
