# VPSVNDEX — Production Upgrade Guide

## 🎯 Nâng cấp đã hoàn thành

### 1. **Database Schema v2.0** ✓
- **Role-based access**: Bảng `user_profiles` với enum `user_role` (customer/admin/superadmin)
- **Audit logs**: Bảng `order_audit_logs` tự động ghi lại mọi thay đổi
- **Rate limiting**: Trigger DB chặn spam (max 5 đơn pending/24h)
- **Enhanced orders**: Thêm `instance_id`, `hostname`, `confirmed_by`, `provisioned_by`
- **RLS security**: Admin functions check role thông qua `is_admin()` helper

### 2. **Frontend Security** ✓
- **Supabase config**: Options API với `autoRefreshToken`, `persistSession`
- **Feature flags**: `VPSVNDEX_FEATURES` để bật/tắt tính năng không cần deploy
- **Rate limit UI**: Warning khi user tạo quá nhiều đơn
- **Maintenance mode**: Toàn bộ site có thể bật maintenance bằng 1 flag

### 3. **Admin Panel v2.0** ✓
- **Role check**: Verify admin role từ DB trước khi cho vào panel
- **Security-first**: Mọi RPC function đều check `is_admin()` ở DB layer
- **Better UX**: Toast rõ ràng khi không có quyền admin
- **Session validation**: Kiểm tra session vẫn valid khi reload trang

### 4. **SEO Optimization** ✓
- **Meta tags đầy đủ**: Open Graph + Twitter Card
- **Keywords**: VPS Việt Nam, VPS US, Cloud Server, GPU VPS
- **Preconnect**: DNS prefetch cho Supabase endpoint
- **Font optimization**: `display=swap` để tránh FOIT

### 5. **Performance & Analytics** ✓
- **Performance monitoring**: Log timing vào console (DNS, TCP, DOM, Load)
- **Google Analytics**: Tích hợp sẵn (chỉ cần điền GA_ID)
- **Sentry**: Error tracking production (chỉ cần điền DSN)
- **Feature detection**: Check browser support trước khi dùng APIs

---

## 📋 Checklist triển khai production

### Bước 1: Setup Supabase (10 phút)

```bash
# 1. Mở SQL Editor: https://supabase.com/dashboard/project/hkwzkgfnrkoassnzkwvb/sql/new
# 2. Copy toàn bộ nội dung file supabase-setup-all-in-one.sql
# 3. Paste và click "Run" (góc dưới bên phải)
# 4. Đợi ~10 giây → thấy "Production setup complete ✓"
```

### Bước 2: Cấp quyền admin cho tài khoản (2 phút)

```sql
-- Chạy trong SQL Editor sau khi setup xong
-- Thay email bằng email admin của bạn
UPDATE auth.users 
SET email_confirmed_at = now() 
WHERE email = 'admin@vpsvndex.com';

INSERT INTO public.user_profiles (id, role, full_name)
SELECT id, 'admin', 'Administrator'
FROM auth.users 
WHERE email = 'admin@vpsvndex.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

### Bước 3: Test admin login

1. Mở https://vpsvndex1222.vercel.app/admin.html
2. Đăng nhập bằng email admin + password đã đăng ký
3. Nếu thành công → vào được admin panel
4. Nếu báo "không có quyền admin" → kiểm tra lại bước 2

### Bước 4: Config features (tùy chọn)

Mở `supabase-config.js` và điều chỉnh:

```javascript
window.VPSVNDEX_FEATURES = {
  emailNotifications: false,      // Bật sau khi setup Edge Functions
  autoConfirmPayment: false,      // Bật sau khi setup webhook
  showRateLimitWarning: true,     // Nên bật
  maxPendingOrdersPerDay: 5,      // Tùy chỉnh
  maintenanceMode: false,         // Bật khi cần bảo trì
};
```

### Bước 5: Deploy

```bash
git add -A
git commit -m "feat: production upgrade v2.0 - security & performance"
git push origin main
```

Vercel sẽ tự động deploy trong ~2 phút.

---

## 🔐 Security Checklist

- [x] Admin auth với role check ở DB layer
- [x] RLS policies cho orders, profiles, audit_logs
- [x] Rate limiting (5 đơn/24h mỗi user)
- [x] Audit logs tự động cho mọi thay đổi orders
- [x] Service role key KHÔNG để trong frontend
- [x] Session validation khi reload admin panel
- [ ] Email notifications (cần setup Edge Functions)
- [ ] Payment webhook (cần setup Casso/VCB API)
- [ ] VPS provisioning API (cần setup Proxmox/Linode)

---

## 🚀 Roadmap tiếp theo

### Phase 2: Email & Notifications (tuần này)

**File cần tạo**: `supabase/functions/send-order-email/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { orderId, type } = await req.json()
  
  // type: 'created' | 'confirmed' | 'provisioned'
  // Fetch order info
  // Send email via Resend API
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

Trigger từ Supabase Database Webhooks:
- `orders` table → `INSERT` → gọi Edge Function với `type=created`
- `orders` table → `UPDATE status=confirmed` → gọi với `type=confirmed`
- `orders` table → `UPDATE status=provisioned` → gọi với `type=provisioned`

### Phase 3: Payment Webhook (tuần sau)

**Endpoint**: `/api/casso-webhook` (Vercel Serverless Function)

```javascript
// api/casso-webhook.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { amount, description, transaction_id } = req.body;
  
  // Parse description: "VPSVNDEX STARTER VN"
  // Find order với package_id + region + amount
  // Auto confirm order
  // Send notification
  
  return res.status(200).json({ success: true });
}
```

### Phase 4: VPS Provisioning (tháng này)

**Proxmox API Integration**:

```javascript
// api/provision-vps.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export default async function handler(req, res) {
  const { orderId, packageId, region } = req.body;
  
  // 1. Call Proxmox API để tạo VM
  const vm = await axios.post('https://proxmox/api2/json/nodes/node1/qemu', {
    vmid: Math.floor(Math.random() * 9000) + 1000,
    memory: 16384,  // 16GB cho gói starter
    cores: 6,
    ...
  });
  
  // 2. Update order với instance_id, hostname
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  await supabase.rpc('admin_provision_order', {
    p_order_id: orderId,
    p_instance_id: vm.data.vmid,
    p_hostname: `vps-${vm.data.vmid}.vpsvndex.com`,
  });
  
  return res.json({ success: true, vmid: vm.data.vmid });
}
```

---

## 📊 Monitoring & Analytics

### Google Analytics Setup (5 phút)

1. Tạo GA4 property: https://analytics.google.com/
2. Copy Measurement ID (dạng `G-XXXXXXXXXX`)
3. Paste vào `supabase-config.js`:

```javascript
window.VPSVNDEX_ANALYTICS = {
  gaId: 'G-XXXXXXXXXX',
};
```

### Sentry Error Tracking (5 phút)

1. Tạo project: https://sentry.io/signup/
2. Copy DSN
3. Thêm Sentry SDK vào `index.html`:

```html
<script src="https://browser.sentry-cdn.com/7.x.x/bundle.min.js"></script>
```

4. Config trong `supabase-config.js`:

```javascript
window.VPSVNDEX_ANALYTICS = {
  sentryDsn: 'https://xxx@sentry.io/xxx',
};
```

---

## 🐛 Troubleshooting

### Lỗi: "Access denied: admin role required"

**Nguyên nhân**: User chưa có role admin trong bảng `user_profiles`

**Fix**:
```sql
UPDATE user_profiles SET role = 'admin' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

### Lỗi: "Bạn đã tạo quá nhiều đơn chờ xác nhận"

**Nguyên nhân**: Rate limit trigger đang hoạt động (5 đơn/24h)

**Fix tạm thời** (trong SQL Editor):
```sql
-- Xóa đơn pending cũ
DELETE FROM orders 
WHERE user_email = 'test@example.com' 
AND status = 'pending';
```

**Fix vĩnh viễn**: Tăng limit trong DB trigger hoặc feature flag.

### Admin panel không load stats

**Nguyên nhân**: RPC function `admin_stats()` lỗi hoặc chưa grant execute

**Fix**:
```sql
GRANT EXECUTE ON FUNCTION admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_orders() TO authenticated;
```

---

## 📝 Changelog v2.0

### Added
- ✅ Role-based access control (customer/admin/superadmin)
- ✅ Audit logs cho mọi thay đổi orders
- ✅ Rate limiting (5 pending orders/24h per user)
- ✅ Maintenance mode flag
- ✅ Feature flags system
- ✅ SEO meta tags (Open Graph + Twitter Card)
- ✅ Performance monitoring
- ✅ Google Analytics ready
- ✅ Sentry error tracking ready

### Changed
- ⚡ Admin auth: Từ mock client-side → real DB role check
- ⚡ Orders schema: Thêm instance_id, hostname, confirmed_by, provisioned_by
- ⚡ RPC functions: Security definer + role check
- ⚡ Supabase config: Thêm options API
- ⚡ Font loading: Thêm display=swap

### Security
- 🔒 RLS policies: Users chỉ đọc được orders của mình
- 🔒 Admin RPC: Check is_admin() trước khi execute
- 🔒 Rate limit trigger: Ngăn spam orders
- 🔒 Session validation: Verify khi reload admin panel

---

## 🎓 Best Practices đã áp dụng

1. **Defense in depth**: Security ở cả frontend (auth check) + backend (RLS + RPC role check)
2. **Fail-safe defaults**: Supabase init fail → vẫn render UI, chỉ disable auth
3. **Progressive enhancement**: Analytics, Sentry optional → site vẫn chạy nếu thiếu
4. **Performance budgets**: Preconnect DNS, font display swap, lazy load ready
5. **Audit trail**: Mọi thay đổi orders đều ghi log với timestamp + user
6. **Rate limiting**: Ngăn abuse ở DB layer, không dựa vào frontend validation

---

## 💡 Tips vận hành

### Tạo admin mới

```sql
-- 1. User phải đăng ký trước qua web
-- 2. Sau đó chạy:
UPDATE user_profiles 
SET role = 'admin', full_name = 'Tên Admin' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'new-admin@vpsvndex.com');
```

### Xem audit logs của 1 đơn

```sql
SELECT * FROM order_audit_logs 
WHERE order_id = 'uuid-cua-don-hang'
ORDER BY performed_at DESC;
```

### Reset rate limit cho 1 user

```sql
UPDATE orders SET status = 'cancelled' 
WHERE user_id = 'user-uuid' AND status = 'pending';
```

### Backup data

```bash
# Từ Supabase Dashboard: Settings → Database → Backups
# Hoặc dùng pg_dump (cần database password):
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

---

## ✅ Production Checklist cuối cùng

- [ ] Đã chạy SQL setup trong Supabase
- [ ] Đã cấp admin role cho ít nhất 1 tài khoản
- [ ] Đã test login admin panel thành công
- [ ] Đã test tạo đơn hàng từ frontend
- [ ] Đã test admin confirm order
- [ ] Đã test admin provision VPS
- [ ] Đã điền Google Analytics ID (nếu cần)
- [ ] Đã setup Sentry (nếu cần)
- [ ] Đã thêm domain tùy chỉnh vào Vercel
- [ ] Đã bật HTTPS trên Vercel
- [ ] Đã backup Supabase database

---

**Hỗ trợ**: Nếu gặp vấn đề, check:
1. Browser console (F12) → xem error logs
2. Supabase Dashboard → Logs → xem DB errors
3. File này → Troubleshooting section

**Version**: 2.0.0 (Oct 5, 2026)
