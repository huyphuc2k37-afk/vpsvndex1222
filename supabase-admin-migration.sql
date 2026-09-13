-- =============================================================
-- VPSVNDEX — Admin migration (chạy 1 lần trong Supabase SQL Editor)
-- Bổ sung: cột VPS credentials + RPC admin (bypass RLS)
-- =============================================================

-- 1) Thêm cột credentials & admin notes
alter table orders
  add column if not exists vps_ip text,
  add column if not exists vps_password text,
  add column if not exists vps_username text default 'root',
  add column if not exists admin_notes text,
  add column if not exists provisioned_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- 2) Mở rộng status
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'provisioned', 'cancelled'));

-- 3) Trigger tự cập nhật updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- 4) RPC: list tất cả orders (admin only qua client-side gate)
create or replace function admin_list_orders()
returns setof orders
language sql
security definer
set search_path = public
as $$
  select * from orders order by created_at desc;
$$;

-- 5) RPC: cấp VPS cho 1 đơn (random IP/password được generate ở client, RPC chỉ lưu)
create or replace function admin_provision_order(
  p_order_id   uuid,
  p_vps_ip     text,
  p_vps_password text,
  p_vps_username text default 'root',
  p_admin_notes text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare v orders;
begin
  update orders
    set vps_ip        = p_vps_ip,
        vps_password  = p_vps_password,
        vps_username  = p_vps_username,
        admin_notes   = p_admin_notes,
        status        = 'provisioned',
        provisioned_at = now()
    where id = p_order_id
    returning * into v;
  return v;
end;
$$;

-- 6) RPC: đổi status (confirm / cancel)
create or replace function admin_update_status(
  p_order_id uuid,
  p_status   text
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare v orders;
begin
  update orders set status = p_status
    where id = p_order_id
    returning * into v;
  return v;
end;
$$;

-- 7) RPC: thống kê dashboard
create or replace function admin_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total',      (select count(*) from orders),
    'pending',    (select count(*) from orders where status = 'pending'),
    'confirmed',  (select count(*) from orders where status = 'confirmed'),
    'provisioned',(select count(*) from orders where status = 'provisioned'),
    'cancelled',  (select count(*) from orders where status = 'cancelled'),
    'revenue',    coalesce((select sum(amount_vnd) from orders where status = 'provisioned'), 0)
  );
$$;

-- 8) Cho phép anon + authenticated gọi các RPC (auth gate ở client)
grant execute on function admin_list_orders()              to anon, authenticated;
grant execute on function admin_provision_order(uuid, text, text, text, text) to anon, authenticated;
grant execute on function admin_update_status(uuid, text)  to anon, authenticated;
grant execute on function admin_stats()                    to anon, authenticated;
