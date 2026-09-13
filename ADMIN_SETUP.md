# Hướng dẫn setup Admin Dashboard

## Lỗi hiện tại
> "Không tải được danh list đơn: Could not find the function public.admin_list_orders without parameters in the schema cache"
>
> HOẶC
>
> "ERROR: 42P01: relation 'orders' does not exist"

Nghĩa là Supabase chưa có các RPC function mà admin.js gọi tới, hoặc bảng `orders` chưa được tạo.

## Bước 0 — Chạy schema bảng (BẮT BUỘC nếu chưa có bảng orders)

Nếu bạn gặp lỗi `relation "orders" does not exist`, project của bạn chưa có bảng. Chạy file này **TRƯỚC**:

1. Truy cập **Supabase Dashboard**: https://supabase.com/dashboard
2. Chọn project **VPSVNDEX** (ref: `jmttogxuzsefvxrjplaf`)
3. Vào **SQL Editor** (icon ở menu trái)
4. Bấm **New query**
5. Mở file `C:\Users\Admin\Documents\vpsvndex\supabase-orders-schema.sql` bằng Notepad/VSCode
6. **Ctrl+A → Ctrl+C** toàn bộ nội dung
7. **Ctrl+V** vào SQL Editor
8. Bấm **Run** (hoặc Ctrl+Enter)

Sẽ thấy kết quả cuối: `orders table created` và `0` rows.

## Bước 1 — Chạy SQL migration admin

1. Truy cập **Supabase Dashboard**: https://supabase.com/dashboard
2. Chọn project **VPSVNDEX** (ref: `jmttogxuzsefvxrjplaf`)
3. Vào **SQL Editor** (icon ở menu trái)
4. Bấm **New query**
5. Mở file `C:\Users\Admin\Documents\vpsvndex\supabase-admin-migration.sql` bằng Notepad/VSCode
6. **Ctrl+A → Ctrl+C** toàn bộ nội dung
7. **Ctrl+V** vào SQL Editor
8. Bấm **Run** (hoặc Ctrl+Enter)

Sau khi Run thành công, bạn sẽ thấy ở panel **Results** các `Success. No rows returned` — là OK.

## Bước 2 — Kiểm tra function đã tạo

Trong SQL Editor, chạy tiếp:

```sql
select proname, pronargs
from pg_proc
where proname in ('admin_list_orders', 'admin_stats', 'admin_update_status', 'admin_provision_order')
order by proname;
```

Phải trả về **4 dòng**:

| proname | pronargs |
|---|---|
| admin_list_orders | 0 |
| admin_stats | 0 |
| admin_update_status | 2 |
| admin_provision_order | 5 |

## Bước 3 — Tạo tài khoản admin

Trong SQL Editor, chạy:

```sql
-- Tạo user admin (mật khẩu đã hash sẵn bằng bcrypt của "admin123")
-- Nếu muốn đổi password, dùng Supabase Dashboard > Authentication > Users > Add user
-- rồi set email_confirmed_at = now() và copy id thay vào bên dưới.

-- Tạo user trong auth.users (chạy 1 lần):
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'admin@vpsvndex.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', ''
);

-- Hoặc đơn giản hơn: dùng Dashboard > Authentication > Users > Add user (manual)
-- Sau đó set email_confirmed_at = now() bằng SQL.
```

**Khuyến nghị: dùng cách thủ công cho nhanh**

1. Vào **Authentication** → **Users** → **Add user** → **Create new user**
2. Email: `admin@vpsvndex.com` (hoặc email bạn muốn)
3. Password: `admin123` (hoặc password mạnh hơn)
4. **Auto Confirm User**: bật ON
5. Bấm **Create user**
6. Quay lại **SQL Editor**, chạy:

```sql
update auth.users
set email_confirmed_at = now()
where email = 'admin@vpsvndex.com';
```

## Bước 4 — Đăng nhập admin

1. Truy cập https://www.vpsvndex.click/admin.html
2. Nhập email + password vừa tạo
3. Bấm **Đăng nhập**

Bạn sẽ thấy dashboard với:
- 📊 Thẻ thống kê (Tổng / Chờ / Đã cấp / Doanh thu)
- 📋 Bảng đơn hàng (filter theo trạng thái)
- ⚙️ Nút Xác nhận / Cấp VPS / Hủy cho mỗi đơn

## Nếu vẫn lỗi

**Lỗi 401 khi đăng nhập** → Kiểm tra email đã `email_confirmed_at` chưa (Bước 3).

**Lỗi "permission denied for table orders"** → RLS chặn. Chạy thêm:

```sql
alter table orders disable row level security;
```

(vì auth gate ở client, RPC `security definer` đã bypass RLS rồi, nhưng một số query có thể cần.)

**Lỗi "function does not exist"** → Quay lại Bước 1, chắc chắn SQL Editor báo "Success".
