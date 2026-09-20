// Cấu hình Supabase cho VPSVNDEX.
// Lấy URL và anon key tại: https://app.supabase.com → Project → Settings → API
// Anon key là key PUBLIC, an toàn để lộ ra frontend (đã được RLS bảo vệ).
// ⚠️ KHÔNG BAO GIỜ đặt service_role key / DB password vào file này.
window.SUPABASE_CONFIG = {
  url: "https://hkwzkgfnrkoassnzkwvb.supabase.co",
  anonKey: "sb_publishable_yEJeyUuFF6UYNLA-NIiVbQ_SMaoF6rr",
};
