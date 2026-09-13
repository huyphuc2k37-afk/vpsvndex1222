-- =============================================================
-- VPSVNDEX — Migration bổ sung: thêm user_id vào orders
-- Chạy SAU supabase-orders-schema.sql + supabase-admin-migration.sql
-- =============================================================

-- 1) Thêm cột user_id (nullable để không phá đơn cũ)
alter table public.orders
  add column if not exists user_id uuid
  references auth.users(id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id);

-- 2) Vẫn giữ user_email cho khớp schema cũ + dùng cho admin lọc nhanh
--    (Đã có sẵn ở supabase-orders-schema.sql)

-- 3) Drop policy cũ nếu muốn siết chặt theo user_id (tuỳ chọn)
--    Hiện tại giữ nguyên policy "read_all" cho anon + auth để admin dễ truy vấn.

-- 4) Kiểm tra cột đã thêm
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
order by ordinal_position;
