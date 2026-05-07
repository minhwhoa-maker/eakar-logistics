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

## Architecture

### Page roles
- `bai10.html` — landing page + Google OAuth + role redirect. Có `<style>` block riêng (~220 dòng) cho hero/stats/features layout (KHÔNG dùng `.card` chuẩn).
- `owner-dashboard.html` — owner xem báo cáo trips, filter tháng, realtime subscribe `trips`. Header có nav đến driver/vehicles. Bảng trips có cột "Chi tiết" link đến `trip-detail.html`. Có floating AI chatbot (nút FAB góc phải) gọi qua `/api/chat` Vercel proxy với context trips hiện tại.
- `trip-detail.html` — trang shared cho cả driver và owner xem chi tiết 1 chuyến. Auth dùng `getSession() + getUserProfile()` (không dùng `requireRole`). Driver chỉ xem được trip của mình; owner xem được tất cả. Driver + dang_chay: có thể thêm/sửa/xóa chi phí inline. Hiển thị GPS links nếu có tọa độ.
- `driver-page.html` — driver quản lý chuyến theo flow mới: 2 tab ("Đang chạy" / "Hoàn thành"), tạo chuyến → thêm nhiều chi phí phát sinh (có GPS bắt buộc) → xác nhận hoàn thành (có confirm modal).
- `driver.html` — owner quản lý tài xế, tính lương theo tháng, export Excel/PDF.
- `vehicles.html` — owner quản lý xe + bảo dưỡng inline.
- `style.css` — design system shared, dùng CSS variables.
- `shared.js` — JS utilities shared (xem dưới).
- `sw.js` + `manifest.json` — PWA, chỉ register từ `bai10.html`. Khi deploy thay đổi cho các file được cache (bai10, style.css, manifest, icons), phải bump `CACHE_NAME` trong `sw.js` (hiện tại `van-tai-v4`) để invalidate cache cũ.

### shared.js (BẮT BUỘC dùng cho mọi page mới)
```
createSb()              → tạo Supabase client với URL+anon key built-in
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

### Auth flow & 2 ID schemes (gotcha quan trọng)
`users.id` có thể có 2 origin khác nhau:
- (a) **Auth UUID**: khi user signup qua `bai10.checkUserRole` (Google login lần đầu, chưa có row) → INSERT với `id: session.user.id`.
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
- Bảng nhiều cột bọc trong `<div class="table-scroll wide">` để mobile scroll ngang.
- All asset links dùng **relative path** (`manifest.json`, `style.css`, `sw.js`, `shared.js`) — không có leading `/`.

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

### owner-dashboard.html — AI chatbot

State globals:
```js
let chatOpen = false
let messages = []      // conversation history gửi lên API
let tripsData = []     // snapshot trips từ lần loadTrips() gần nhất
let totalsData = {}    // { tong_doanh_thu, tong_chi_phi, tong_loi_nhuan, tong_luong }
```

`saveChatContext(trips, dt, cp, luong)` được gọi cuối `loadTrips()` sau `renderTrips()` để cập nhật snapshot. Chatbot đọc `tripsData`/`totalsData` khi build system prompt — không fetch DB riêng.

`sendMessage()` POST lên `/api/chat` (Vercel serverless proxy). Model: `claude-sonnet-4-20250514`.

### api/chat.js — Vercel serverless proxy

`api/chat.js` nhận POST, forward thẳng body lên `https://api.anthropic.com/v1/messages` với `x-api-key` từ `process.env.ANTHROPIC_API_KEY`. Cần set env var này trong Vercel Dashboard → Project Settings → Environment Variables. Không có key → API trả 401.

### Realtime subscriptions
`owner-dashboard.html` subscribe channel `trips-changes` cho table `trips`. Channel được lưu trong `tripsChannel` và cleanup ở `beforeunload` qua `sb.removeChannel(tripsChannel)`.

### driver-page.html — patterns đặc thù

Page dùng 2 biến state toàn cục:
```js
let activeFormId = null        // formId của form đang mở, null nếu không có
let activeReceiptFile = null   // File ảnh đang được chọn trong form active
```

**Form management** — chỉ 1 form mở tại 1 thời điểm:
- Mỗi form container có `data-form-id="<formId>"`.
- formId scheme: `'new-trip'`, `'add-{tripId}'`, `'edit-{expenseId}'`, `'complete-{tripId}'`.
- `openForm(formId)` — đóng form cũ, reset `activeReceiptFile`, mở form mới.
- `closeActiveForm()` — đóng form hiện tại, reset cả `activeFormId` và `activeReceiptFile`.
- Save/cancel handler: gọi `closeActiveForm()` sau khi xử lý xong.

**Form inputs** — dùng `data-field` attribute thay vì ID để tránh conflict với nhiều card:
```js
const form = document.querySelector(`[data-form-id="add-${tripId}"]`)
const loai = form.querySelector('[data-field="loai"]').value
```

**Upload group** — `buildUploadGroup(onRemove)` tạo block upload tái sử dụng. Preview image cần inline style (không có class CSS). Edit form dùng `wrap.dataset.photoRemoved = 'true'` khi user xóa ảnh.

**Chi phí reload** — sau mỗi insert/update/delete `chi_phi_chuyen`, gọi `reloadTripChiPhi(tripId)` để fetch `trips.chi_phi` mới nhất từ DB (DB trigger tự sync).

**GPS bắt buộc cho 3 thao tác**:
- **Tạo chuyến** (`submitNewTrip`): validate → GPS (fail → return) → insert với `lat_bat_dau/lng_bat_dau`.
- **Hoàn thành chuyến** (`submitComplete`): validate doanh_thu → GPS (fail → return) → update với `lat_ket_thuc/lng_ket_thuc`.
- **Thêm chi phí** (`submitAddExpense`): validate → GPS (disable button, fail → re-enable + return) → upload ảnh → insert với `lat/lng`. Nếu GPS fail, upload không chạy.

Tất cả 3 thao tác đều hiện toast "Đang lấy vị trí GPS..." trước khi gọi `getLocation()`.

## Database

```
users          (id, email, full_name, sdt, role)                        -- role: 'owner' | 'driver'
trips          (id, ngay_bat_dau, ngay_ket_thuc, tuyen_duong, doanh_thu,
                chi_phi, luong_chuyen, tam_ung, hoan_ung, tai_xe_id,
                ghi_chu, trang_thai, anh_hoa_don,
                lat_bat_dau, lng_bat_dau, lat_ket_thuc, lng_ket_thuc)
                -- ngay_bat_dau/ngay_ket_thuc: timestamptz
                -- trang_thai: 'dang_chay' | 'hoan_thanh'
                -- anh_hoa_don: legacy, không còn dùng trong flow mới
                -- chi_phi: được sync tự động bởi DB trigger từ chi_phi_chuyen
                -- lat/lng fields: nullable, lưu tọa độ GPS khi tạo/hoàn thành chuyến
chi_phi_chuyen (id, trip_id, loai, mo_ta, so_tien, anh_url, created_at, lat, lng)
                -- loai: 'xang' | 'sua_xe' | 'bai_xe' | 'khac'
                -- anh_url: public URL từ storage bucket 'receipts'
                -- lat/lng: nullable, tọa độ GPS khi thêm chi phí
tam_ung_thang  (id, tai_xe_id, thang, so_tien, ghi_chu)                -- thang format: 'YYYY-MM'
xe             (id, bien_so, loai_xe, nam_sx, trang_thai, tai_xe_id)   -- trang_thai: 'hoat_dong' | 'bao_duong' | 'tam_nghi'
bao_duong      (id, xe_id, ngay, loai, mo_ta, chi_phi, created_at)     -- loai: 'hong_hoc' | 'linh_kien' | 'lop_xe' | 'dinh_ky'
```

- `tai_xe_id` luôn = `users.id` (không phải Auth UUID).
- `ngay_bat_dau` dùng `new Date().toISOString()` khi insert, hiển thị qua `formatDate()` thành `HH:MM - DD/MM/YY`.
- Filter tháng dùng: `.gte('ngay_bat_dau', start + 'T00:00:00').lt('ngay_bat_dau', endStr + 'T00:00:00')`.
- **DB trigger** (cần tạo trong Supabase): sau mỗi insert/update/delete trên `chi_phi_chuyen`, trigger tự update `trips.chi_phi = SUM(so_tien)` của trip tương ứng. Nếu trigger chưa tồn tại, `trips.chi_phi` sẽ không tự cập nhật.

## Storage

- Bucket: `receipts` (cần Public access để `getPublicUrl()` hoạt động).
- Path format: `{users.id}/{timestamp}.{ext}` — extension đã sanitize regex.
- Field `anh_url` trong `chi_phi_chuyen` lưu public URL. Field `anh_hoa_don` trong `trips` là legacy.

## Notes / Gotchas

- **RLS disabled** trên tất cả tables. Khi bật RLS, các chỗ sau sẽ break:
  - `bai10.loadStats()` — query `trips`/`users` công khai để hiển thị landing stats.
  - Page admin/driver sẽ cần policy "user đọc được row của mình" + "owner đọc được tất cả".
- **`bai10.checkUserRole`** là duy nhất chỗ INSERT vào `users` từ Google OAuth (signup-on-login). `shared.getUserRole/getUserProfile` chỉ select.
- **`bai10.formatStatNumber`** (local) ≠ `shared.formatMoney`: bai10 hiển thị dạng rút gọn `1.2B`/`345M`/`12K`, các page khác dùng full `1.234.567 đ`.
- **Date format hiển thị**: `HH:MM - DD/MM/YY` (2 chữ số năm, có giờ phút). Đây là output của `formatDate()` hiện tại.
- **Currency**: luôn `đ` (chữ thường), KHÔNG dùng `₫` unicode.
- **Google OAuth `redirectTo`**: dùng `window.location.origin + '/bai10.html'` để hoạt động cả local và production.

## Recent changes log

- Bài 35 (2026-05-07): Fix chatbot `owner-dashboard.html` — sửa `chat-header` HTML dùng đúng `.chat-header-avatar`/`.chat-header-info`/`.name`/`.status` để khớp CSS. Tạo `api/chat.js` Vercel serverless proxy thay cho direct browser call; xóa `ANTHROPIC_API_KEY` const khỏi client-side. FAB ẩn khi chat panel mở.
- Bài 34 (2026-05-06): AI chatbot trong `owner-dashboard.html` — floating FAB + chat panel, gọi Anthropic API với context trips. State: `tripsData`/`totalsData` được cập nhật qua `saveChatContext()` cuối mỗi `loadTrips()`. CSS chatbot thêm vào `style.css`.
- Bài 33 (2026-05-06): Mở rộng GPS tracking — `submitNewTrip` lưu `lat_bat_dau/lng_bat_dau` khi tạo chuyến, `submitComplete` lưu `lat_ket_thuc/lng_ket_thuc` khi hoàn thành chuyến. Hoàn thiện GPS toàn bộ trip lifecycle (tạo → chi phí → hoàn thành).
- Bài 32 (2026-05-05): GPS tracking — thêm `getLocation()` vào `shared.js`. `submitAddExpense` trong `driver-page.html` bắt buộc lấy GPS trước upload, lưu `lat/lng` vào `chi_phi_chuyen`. Thêm cột GPS vào schema `trips` và `chi_phi_chuyen`. Tạo `trip-detail.html` — trang shared driver/owner xem chi tiết chuyến, driver có thể edit chi phí inline khi dang_chay. `owner-dashboard.html`: bỏ cột Tạm ứng/Hoàn ứng/Còn lại/Ảnh HĐ, thêm cột Chi tiết link đến `trip-detail.html`. `driver-page.html`: confirm modal trước khi hoàn thành chuyến, nút "Thêm chi phí" full-width symmetric. Xóa dead code `formatDate` đầu tiên trong `shared.js`.
- Bài 31 (2026-05-05): Refactor `driver-page.html` — multi-expense trip tracking. 2 tab Đang chạy/Hoàn thành, tạo chuyến mới, thêm/sửa/xóa chi phí per trip, xác nhận hoàn thành với doanh thu thực tế. Thêm bảng `chi_phi_chuyen`. Đổi `ngay` → `ngay_bat_dau` (timestamptz) trên `trips`, thêm `trang_thai`/`ngay_ket_thuc`. Update `formatDate()` xuất `HH:MM - DD/MM/YY`. Fix filter tháng dùng timestamptz trong `owner-dashboard.html` và `driver.html`.
- Bài 30 (2026-05-03): Thay toàn bộ `alert()` bằng `showToast()` trong 4 page. Refactor `driver-page.html` — bỏ `showMsg()`/`#msg` div, thêm `resetForm()`.
- Bài 29 (2026-05-03): Tạo `shared.js`, fix lệch ID Auth/users, đồng bộ format tiền tệ, thêm nav `vehicles.html` ở header owner-dashboard, `setupLogoutListener` cho mọi admin page.
- Bài 28: Redesign `bai10.html` thành landing mobile-first (hero + stats public + features + CTA).
- Bài 27: Security hardening — chuyển từ `innerHTML` template literal sang `createElement`/`textContent` (chống XSS), validation `Number.isFinite`, error handling toàn diện, `.table-scroll` wrapper cho mobile.
- Bài 26: Tách shared `style.css`, xóa `<style>` blocks khỏi 4 page admin/driver.
- Bài 25 trở về trước: xem `git log`.
