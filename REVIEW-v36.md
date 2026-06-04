# REVIEW v36 — Rà soát toàn project (chỉ point out, KHÔNG fix)

Ngày: 2026-06-04. Phạm vi: 4 trục yêu cầu — (1) auth 2-ID + race async, (2) security (repo PUBLIC), (3) DB FK → public.users, (4) PRESET_PARTS đồng bộ.

---

## 🔴 CRITICAL — Security (repo + app PUBLIC)

### S1. RLS tắt + anon key public = full DB read/write cho bất kỳ ai
- `shared.js:5` và CLAUDE.md công khai `SUPABASE_ANON_KEY`. Bản thân anon key public là đúng thiết kế **CHỈ KHI RLS bật**. CLAUDE.md tự ghi: "**RLS disabled** trên tất cả tables".
- Hệ quả: bất kỳ ai có anon key (lấy thẳng từ repo) đều `select/insert/update/delete` mọi bảng qua Supabase REST.
- **Nguy hiểm nhất — bảng `sessions`**: anon `SELECT * FROM sessions` → lấy **mọi `token`** của driver/supervisor → gắn vào `localStorage.driver_token` → mạo danh toàn bộ tài xế/giám sát. Account takeover hàng loạt. Session **không có expiry** (verify-otp/verify-session đều không check) nên token sống vĩnh viễn.
- Đọc trộm: `users` (SĐT, email, role), `trips`, `route_salary`, `luong_thang` (lương). Ghi đè: ai cũng INSERT/UPDATE trips, chi_phi, đổi lương, xóa dữ liệu.
- → Đây là lỗ hổng số 1. Mọi lớp phòng thủ UI (`.owner-only`, requireRole) đều vô nghĩa khi anon REST mở. Phase B (RLS) phải coi là chặn-cửa bắt buộc, không phải milestone "nice to have".

### S2. Các API proxy KHÔNG auth → drain API key trả phí
Tất cả endpoint sau không kiểm tra danh tính người gọi; live URL đã biết công khai:
- `api/chat.js` — proxy thẳng tới Anthropic. **`body: { ...req.body }`** → client điều khiển TOÀN BỘ `model`, `system`, `messages`, `max_tokens`. Tức là 1 free general-purpose Claude proxy, abuser chọn model đắt nhất, đốt `ANTHROPIC_API_KEY` không giới hạn.
- `api/maps.js` — đốt `VIETMAP_API_KEY` (geocode/route/TSP, mỗi call tốn tiền).
- `api/parse-diem.js`, `api/parse-hoi-thoai.js`, `api/phan-loai-bao-duong.js` — đốt `OPENROUTER_API_KEY` (DeepSeek).
- Không rate-limit, không origin check. Một script vòng lặp = hóa đơn API tùy ý.

### S3. `api/subscribe.js` + `api/notify.js` không auth
- `subscribe.js`: ai cũng upsert `push_subscriptions` cho `user_id` bất kỳ → ghi đè subscription của owner (chặn owner nhận push) hoặc nhồi rác.
- `notify.js`: ai cũng kích push tới owner bất kỳ (spam thông báo). Response khác nhau (`no_subscription` vs `ok`) → enumerate owner nào đã đăng ký push.

### S4. send-otp — SMS/ZNS bombing + phone enumeration
- Phone enumeration (404/403/200 khác nhau) — CLAUDE.md đã ghi nhận, chấp nhận.
- Bổ sung: attacker biết SĐT driver → spam 5 mã/ngày (rate-limit theo sdt) làm **cạn quota ZNS thật (tốn tiền OA)** và DoS đăng nhập của driver đó (mỗi lần xin mã mới `used=true` mã cũ → driver nhận mã cũ thì vô hiệu).

### S5. `.gitignore` chỉ chặn `.env*.local`, KHÔNG chặn `.env` trần
- Hiện `.env.local` tồn tại local và **đã được ignore đúng** (không tracked — `git ls-files` sạch). OK.
- Nhưng nếu ai đó tạo `.env` (không có `.local`) thì sẽ bị commit lên repo public. Nên thêm `.env` vào `.gitignore` để phòng. (Hardening, chưa rò rỉ.)

---

## 🟠 Auth flow (2-ID scheme) + race async

### A1. `verify-otp.js` — `wrong_attempts` read-modify-write KHÔNG atomic (brute-force)
- `verify-otp.js:49-55`: đọc `row.wrong_attempts` rồi ghi `+1`. CLAUDE.md đã ghi "không atomic".
- Khai thác: bắn N request song song cùng 1 mã → tất cả đọc `wrong_attempts=0`, lock 5-lần vô tác dụng trong burst. Không gian mã 6 số = 1.000.000; mỗi chu kỳ send-otp cho phép thử nhiều hơn dự kiến. Kết hợp S1 (anon đọc thẳng `otp_codes.code`) thì OTP coi như vô nghĩa, nhưng kể cả không có S1 thì counter non-atomic vẫn là điểm yếu thật.

### A2. Session không expiry (chủ ý) — rủi ro nhân lên bởi S1
- `sessions` không TTL; verify-session không check. Một token lộ = quyền vĩnh viễn. Cân nhắc thêm `expires_at` + cleanup.

### A3. 2-ID scheme — nhìn chung NHẤT QUÁN, không thấy leak Auth UUID vào DB
- `verify-otp.js:58-61` lookup `users.id` theo `sdt` rồi INSERT `sessions.user_id = users.id` ✅ (không dùng Auth UUID).
- `route-salary.js:9` resolve-by-email → `profile.id` (DB users.id) làm `owner_id` ✅.
- `bai10.html:301-311` cold-start: verify-session OK → `window.location.replace` theo role; 4xx → xóa token + bind onAuthStateChange; 5xx → `showLogin()` giữ token ✅ khớp CLAUDE.md.
- `shared.js requireRole` xử lý cả 2 auth, retry 3 lần với 5xx/timeout (giữ token), 4xx xóa token ✅.
- `grep currentUser.id` chỉ thấy trong CLAUDE.md (doc), KHÔNG có trong code page nào → không có chỗ leak Auth UUID. ✅

### A4. (Minor) `bai10.checkUser` nhánh 5xx không bind onAuthStateChange
- `bai10.html:322-324`: token + 5xx → `showLogin()` nhưng KHÔNG đăng ký `onAuthStateChange`. Nếu user lúc đó bấm Google login, `SIGNED_IN` sẽ không được bắt cho tới khi reload. Edge case nhỏ, không phải lỗi bảo mật. (Trong `requireRole` của shared.js cũng tương tự: hết retry thì hiện overlay "Thử lại", không bind — chủ ý.)

### A5. (Minor) Bất nhất độ dài SĐT giữa 2 đường
- `validate-diem.validateSDT` ép **đúng 10 số**; `login-sdt.html` (theo CLAUDE.md) validate 9–11 số. Khác ngữ cảnh (parse hội thoại vs login) nên không lỗi trực tiếp, nhưng số 9/11-digit hợp lệ ở login lại bị validateDiem loại — lưu ý khi dùng chéo.

---

## 🟡 DB FK → public.users (KHÔNG kiểm chứng được từ code — cần xác minh trên Supabase)

Không truy vấn được schema thật từ repo; chỉ đối chiếu logic code với CLAUDE.md. Các FK BẮT BUỘC trỏ `public.users(id)` (KHÔNG `auth.users`) vì app dùng DB-generated UUID:
- `sessions.user_id` → CLAUDE.md ghi rõ phải `public.users`. verify-otp INSERT `user_id = users.id` ✅ (nếu FK sai sẽ FK-violation ngay).
- `notify_settings.user_id`, `push_subscriptions.user_id` — subscribe/notify dùng `user_id` = users.id.
- `route_salary.owner_id` → `public.users` ON DELETE CASCADE (CLAUDE.md).
- `luong_thang.owner_id` / `tai_xe_id` → `public.users` CASCADE.
- **Hành động cần làm**: vào Supabase dashboard kiểm tra từng FK constraint thực tế trỏ đúng `public.users`. Code không thể tự xác nhận — đây là điểm rủi ro "ngầm" nếu một bảng nào đó lỡ tạo FK sang `auth.users`.

---

## 🟢 PRESET_PARTS — đồng bộ 3 nơi: ĐẠT

Đối chiếu byte-by-byte, cả 3 nơi GIỐNG HỆT (21 phần tử, cùng thứ tự):
- `api/phan-loai-bao-duong.js:5-12`
- `vehicles.html:381-388`
- `driver-page.html:1136-1143`

→ Hiện đồng bộ. Rủi ro còn lại: vẫn là **triple-duplication** — sửa 1 nơi quên 2 nơi sẽ drift. Cân nhắc tách thành 1 nguồn dùng chung (khó vì 2 nơi browser, 1 nơi serverless ESM). Ghi nhận, không phải lỗi hiện tại.

---

## ⚪ Khác (minor / ghi nhận)

- **`api/maps.js:60-61`** `[TSP_DEBUG]` log full response + input points mỗi call → ồn log Vercel, không lộ secret. `optimized_order = waypoints.map((_,i)=>i)` (line 73) luôn = thứ tự gốc → reorder waypoint ở owner-dashboard thực chất là no-op (CLAUDE.md đã ghi "đang điều tra").
- **`api/maps.js`** trả lỗi với `status 200 + {error}` (intentional cho lookup) — caller phải check `.error`, không dựa HTTP status.
- **`validate-diem.js:57-58`** `sanitizeText` regex strip control-char trông như chứa **ký tự control thật trong source** (không phải escape `\x00-\x1F`). Hoạt động được nhưng dễ vỡ khi save bằng editor đổi encoding/EOL. Nên đổi sang dạng escape `\x00-\x1F\x7F` cho an toàn (giống `phan-loai-bao-duong.js:102` đã dùng escape đúng).
- **`api/notify.js:57`** dùng `.single()` cho `push_subscriptions` (throw nếu 0 row) nhưng có check `subErr` → an toàn; trong khi `settings` dùng `.maybeSingle()`. Bất nhất phong cách, không lỗi.
- **`api/parse-hoi-thoai.js`** validate cứng qua `validateDiem` ✅; nhưng `loai` chỉ nhị phân `giao` vs mặc định `boc` — LLM trả `loai` lạ → ép `boc` (an toàn).
- **`route-salary.js`** lưu ý CLAUDE.md: `email` KHÔNG có DB UNIQUE (chỉ app-enforce). resolveOwner lookup theo email `.maybeSingle()` → nếu lỡ có 2 user trùng email, `.maybeSingle()` sẽ **throw/err** (không trả về row) → 401. Hiếm nhưng là điểm gãy ngầm phụ thuộc app-enforce uniqueness.
- **`shared.js formatBienSo`** không lỗi; **`formatDate`** với `date`-only column lệch giờ — CLAUDE.md đã ghi.

---

## Tóm tắt ưu tiên xử lý
1. **S1 (RLS off + sessions readable)** — CRITICAL, làm trước hết: bật RLS, đặc biệt khóa `sessions`/`otp_codes`/`users`.
2. **S2 (open API proxies, nhất là chat.js cho client chọn model)** — thêm auth/rate-limit.
3. **S3, S4** — auth cho subscribe/notify; cân nhắc giảm bề mặt enumeration.
4. **A1** — atomic increment `wrong_attempts` (RPC/SQL `+1` atomic).
5. Xác minh FK trên dashboard (mục 🟡).
6. S5 + sanitizeText escape — hardening.
