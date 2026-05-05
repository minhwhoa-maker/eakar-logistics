// Fleet App — shared utilities
// Yêu cầu: load supabase-js trước file này

const SUPABASE_URL = 'https://icwmtqfpbefntfxboofr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljd210cWZwYmVmbnRmeGJvb2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Mzg3NzgsImV4cCI6MjA5MjUxNDc3OH0.N1gsPt4eZav2LL2XDttqlsAB06b1UzXb4bFTMi3K8NM'

function createSb() {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// === Formatting ===
function formatMoney(n) {
    const amount = Number(n)
    return (Number.isFinite(amount) ? amount : 0).toLocaleString('vi-VN') + ' đ'
}

// === Auth ===
async function getUserRole(sb, email) {
    const { data, error } = await sb
        .from('users')
        .select('role')
        .eq('email', email)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.role ?? null
}

async function getUserProfile(sb, email) {
    const { data, error } = await sb
        .from('users')
        .select('id, role')
        .eq('email', email)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

// Bảo vệ trang admin: kiểm tra session + role, redirect bai10 nếu không khớp.
// Trả về { user, profile } hoặc null.
async function requireRole(sb, requiredRole) {
    const { data, error } = await sb.auth.getSession()
    if (error || !data?.session?.user?.email) {
        window.location.href = 'bai10.html'
        return null
    }
    try {
        const profile = await getUserProfile(sb, data.session.user.email)
        if (profile?.role !== requiredRole) {
            window.location.href = 'bai10.html'
            return null
        }
        return { user: data.session.user, profile }
    } catch {
        window.location.href = 'bai10.html'
        return null
    }
}

// Tự động redirect về bai10 khi user logout từ tab khác.
function setupLogoutListener(sb) {
    sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.href = 'bai10.html'
        }
    })
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    // Normalize: bỏ timezone offset, chỉ lấy phần datetime
    const clean = dateStr.replace(/\+\d{2}:\d{2}$/, '').replace('T', ' ');
    const d = new Date(clean);
    if (isNaN(d.getTime())) return dateStr;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(2);
    return `${hh}:${mm} - ${dd}/${mo}/${yy}`;
}
function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Thiết bị không hỗ trợ GPS'))
            return
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(new Error('Không lấy được vị trí. Vui lòng bật GPS và thử lại.')),
            { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
        )
    })
}