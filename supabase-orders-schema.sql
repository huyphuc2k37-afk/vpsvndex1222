-- =============================================================
-- VPSVNDEX — Bảng orders + RLS (chạy TRƯỚC supabase-admin-migration.sql)
-- Tạo bảng orders nếu chưa có, kèm RLS policy cho phép đọc/ghi công khai
-- =============================================================

-- 1) Bảng orders
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_email      text not null,
  package_id      text not null,
  package_name    text not null,
  region          text not null check (region in ('vn', 'us')),
  cycle           text not null default '1m' check (cycle in ('1m', '3m', '12m')),
  amount_vnd      bigint not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'provisioned', 'cancelled')),
  vps_ip          text,
  vps_password    text,
  vps_username    text default 'root',
  admin_notes     text,
  provisioned_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index cho truy vấn nhanh
create index if not exists orders_user_email_idx on public.orders (user_email);
create index if not exists orders_status_idx    on public.orders (status);
create index if not exists orders_created_idx   on public.orders (created_at desc);

-- 2) Trigger cập nhật updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 3) RLS — cho phép anon/authenticated đọc + insert (auth gate ở client)
alter table public.orders enable row level security;

drop policy if exists "orders_read_all"   on public.orders;
drop policy if exists "orders_insert_all" on public.orders;
drop policy if exists "orders_update_all" on public.orders;

create policy "orders_read_all"
  on public.orders for select
  to anon, authenticated
  using (true);

create policy "orders_insert_all"
  on public.orders for insert
  to anon, authenticated
  with check (true);

create policy "orders_update_all"
  on public.orders for update
  to anon, authenticated
  using (true)
  with check (true);

-- 4) Dữ liệu mẫu (tùy chọn — comment out nếu không muốn)
-- insert into public.orders (user_email, package_id, package_name, region, cycle, amount_vnd, status)
-- values
--   ('demo@vpsvndex.com', 'vn-s1', 'VPS Nền tảng', 'vn', '1m', 2900000, 'pending'),
--   ('demo@vpsvndex.com', 'us-m1', 'VPS US Standard', 'us', '1m', 3200000, 'confirmed');

-- 5) Verify
select
  'orders table created' as status,
  count(*) as existing_rows
from public.orders;
