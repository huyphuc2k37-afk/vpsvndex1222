// =============================================================
// VPSVNDEX — Supabase Configuration (Production-Ready)
// Lấy URL và anon key từ: https://app.supabase.com → Project → Settings → API
// Anon key là PUBLIC key, an toàn để lộ ra frontend (được bảo vệ bởi RLS)
// ⚠️ KHÔNG BAO GIỜ đặt service_role key hoặc database password vào file này
// =============================================================

window.SUPABASE_CONFIG = {
  url: "https://hkwzkgfnrkoassnzkwvb.supabase.co",
  anonKey: "sb_publishable_yEJeyUuFF6UYNLA-NIiVbQ_SMaoF6rr",
  
  // Options nâng cao (optional)
  options: {
    auth: {
      // Auto refresh token trước khi hết hạn
      autoRefreshToken: true,
      // Persist session vào localStorage
      persistSession: true,
      // Phát hiện session changes từ tab khác
      detectSessionInUrl: true,
    },
    // Realtime subscriptions (nếu cần)
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    // Global request config
    global: {
      headers: {
        'x-client-info': 'vpsvndex-web/2.0',
      },
    },
  },
};

// =============================================================
// Feature Flags (bật/tắt tính năng không cần deploy lại)
// =============================================================
window.VPSVNDEX_FEATURES = {
  // Bật email notifications (cần setup Supabase Edge Functions)
  emailNotifications: false,
  
  // Bật payment webhook auto-confirm
  autoConfirmPayment: false,
  
  // Bật rate limiting UI warning
  showRateLimitWarning: true,
  
  // Số đơn pending tối đa mỗi ngày (sync với DB trigger)
  maxPendingOrdersPerDay: 5,
  
  // Maintenance mode
  maintenanceMode: false,
  maintenanceMessage: "Hệ thống đang bảo trì, vui lòng quay lại sau 30 phút.",
};

// =============================================================
// Analytics & Monitoring (optional)
// =============================================================
window.VPSVNDEX_ANALYTICS = {
  // Google Analytics
  gaId: null, // 'G-XXXXXXXXXX'
  
  // Sentry error tracking
  sentryDsn: null, // 'https://xxx@sentry.io/xxx'
  
  // Hotjar heatmaps
  hotjarId: null, // 1234567
};
