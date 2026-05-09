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
- `owner-dashboard.html` — owner xem báo cáo trips, filter tháng, realtime subscribe `trips`. Header có nav đến driver/vehicles. Bảng trips có cột "Chi tiết" link đến `trip-detail.html`. Có floating AI chatbot (nút FAB góc phải) gọi qua `/api/chat`. Có card "Cài đặt thông báo" với 3 toggle switch (notify_new_trip / notify_complete / notify_expense), load/save qua `notify_settings` table. `setupPushNotifications(userId)` chạy mỗi lần login để đăng ký / tái sử dụng Web Push subscription.
- `trip-detail.html` — trang shared cho cả driver và owner xem chi tiết 1 chuyến. Auth dùng `getSession() + getUserProfile()` (không dùng `requireRole`). Driver chỉ xem được trip của mình; owner xem được tất cả. Driver + dang_chay: có thể thêm/sửa/xóa chi phí inline. Hiển thị GPS links nếu có tọa độ.
- `driver-page.html` — driver quản lý chuyến theo flow mới: 2 tab ("Đang chạy" / "Hoàn thành"), tạo chuyến → thêm nhiều chi phí phát sinh (có GPS bắt buộc) → xác nhận hoàn thành (có confirm modal).
- `driver.html` — owner quản lý tài xế, tính lương theo tháng, export Excel/PDF.
- `vehicles.html` — owner quản lý xe + bảo dưỡng inline.
- `style.css` — design system shared, dùng CSS variables.
- `shared.js` — JS utilities shared (xem dưới).
- `sw.js` + `manifest.json` — PWA, chỉ register từ `bai10.html`. Khi deploy thay đổi cho các file được cache (bai10, style.css, manifest, icons), phải bump `CACHE_NAME` trong `sw.js` (hiện tại `van-tai-v5`) để invalidate cache cũ. Có push handler (hiện notification) + notificationclick handler (focus tab cũ hoặc mở tab mới tới URL trong `notification.data.url`).

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
- Toggle switch notify settings: `.notify-row` (flex row), `.toggle` (label wrapper), `.toggle-slider` (pseudo-element track/thumb). Checked state: `--success` green. Đã có trong `style.css`.
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

### api/ — Vercel serverless functions

Tất cả dùng ESM (`import`/`export default`). `package.json` khai báo `"type": "module"`.

- **`api/chat.js`** — proxy SSE tới Anthropic API. Env: `ANTHROPIC_API_KEY`.
- **`api/subscribe.js`** — POST `{ user_id, subscription }`, upsert vào `push_subscriptions`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- **`api/notify.js`** — POST `{ owner_id, type, payload }`. Check `notify_settings`, gửi push qua `web-push`, tự xóa subscription nếu 410. `type`: `'new_trip'` | `'complete'` | `'expense'`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

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
push_subscriptions (user_id uuid PK, subscription_json jsonb)          -- Web Push subscription object; upsert on conflict user_id
notify_settings    (user_id uuid PK, notify_new_trip bool, notify_complete bool, notify_expense bool)
                                                                        -- NULL row = tất cả bật; chỉ cần upsert khi owner thay đổi
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

