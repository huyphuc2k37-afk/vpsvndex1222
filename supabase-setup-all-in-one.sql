-- =============================================================
-- VPSVNDEX — ALL-IN-ONE setup (chạy 1 lần trong SQL Editor)
-- Tạo bảng orders + RLS + RPC admin
-- Áp dụng cho project Supabase MỚI
-- =============================================================

-- 1) Bang orders
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_email      text not null,
  user_id         uuid references auth.users(id) on delete set null,
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

create index if not exists orders_user_email_idx on public.orders (user_email);
create index if not exists orders_user_id_idx    on public.orders (user_id);
create index if not exists orders_status_idx     on public.orders (status);
create index if not exists orders_created_idx    on public.orders (created_at desc);

-- 2) Trigger updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 3) RLS
alter table public.orders enable row level security;

drop policy if exists "orders_read_all"   on public.orders;
drop policy if exists "orders_insert_all" on public.orders;
drop policy if exists "orders_update_all" on public.orders;

create policy "orders_read_all"   on public.orders for select to anon, authenticated using (true);
create policy "orders_insert_all" on public.orders for insert to anon, authenticated with check (true);
create policy "orders_update_all" on public.orders for update to anon, authenticated using (true) with check (true);

-- 4) RPC admin
create or replace function admin_list_orders() returns setof orders language sql security definer set search_path = public as $$ select * from orders order by created_at desc; $$;

create or replace function admin_provision_order(p_order_id uuid, p_vps_ip text, p_vps_password text, p_vps_username text default 'root', p_admin_notes text default null) returns orders language plpgsql security definer set search_path = public as $$
declare v orders;
begin
  update orders set vps_ip = p_vps_ip, vps_password = p_vps_password, vps_username = p_vps_username, admin_notes = p_admin_notes, status = 'provisioned', provisioned_at = now()
    where id = p_order_id returning * into v;
  return v;
end; $$;

create or replace function admin_update_status(p_order_id uuid, p_status text) returns orders language plpgsql security definer set search_path = public as $$
declare v orders;
begin update orders set status = p_status where id = p_order_id returning * into v; return v; end; $$;

create or replace function admin_stats() returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'total',      (select count(*) from orders),
    'pending',    (select count(*) from orders where status = 'pending'),
    'confirmed',  (select count(*) from orders where status = 'confirmed'),
    'provisioned',(select count(*) from orders where status = 'provisioned'),
    'cancelled',  (select count(*) from orders where status = 'cancelled'),
    'revenue',    coalesce((select sum(amount_vnd) from orders where status = 'provisioned'), 0)
  );
$$;

grant execute on function admin_list_orders()                                            to anon, authenticated;
grant execute on function admin_provision_order(uuid, text, text, text, text)           to anon, authenticated;
grant execute on function admin_update_status(uuid, text)                                to anon, authenticated;
grant execute on function admin_stats()                                                  to anon, authenticated;

-- 5) Verify
select 'orders table ready' as status, count(*) as rows from public.orders;
