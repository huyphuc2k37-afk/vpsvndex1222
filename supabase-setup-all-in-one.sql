-- =============================================================
-- VPSVNDEX — PRODUCTION SETUP v2.0
-- Security-first: Role-based access, rate limiting, audit logs
-- =============================================================

-- 1) Extension cho UUID + crypto
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2) Custom types
do $$ begin
  create type order_status as enum ('pending', 'confirmed', 'provisioned', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_role as enum ('customer', 'admin', 'superadmin');
exception when duplicate_object then null;
end $$;

-- 3) Users metadata table (extend auth.users)
create table if not exists public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'customer',
  full_name       text,
  phone           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists user_profiles_role_idx on public.user_profiles (role);

-- Auto-create profile khi user đăng ký
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.user_profiles (id, role) values (new.id, 'customer');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Orders table (production-ready)
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete restrict,
  user_email      text not null,
  package_id      text not null,
  package_name    text not null,
  region          text not null check (region in ('vn', 'us')),
  cycle           text not null default '1m' check (cycle in ('1m', '3m', '6m', '12m')),
  amount_vnd      bigint not null check (amount_vnd > 0),
  status          order_status not null default 'pending',
  
  -- VPS info (chỉ admin mới set)
  vps_ip          text,
  vps_password    text,
  vps_username    text default 'root',
  instance_id     text,              -- ID từ Proxmox/Linode API
  hostname        text,
  
  -- Admin tracking
  admin_notes     text,
  confirmed_by    uuid references auth.users(id),
  provisioned_by  uuid references auth.users(id),
  confirmed_at    timestamptz,
  provisioned_at  timestamptz,
  
  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  ip_address      inet,              -- IP của user khi tạo đơn (anti-fraud)
  user_agent      text
);

-- Indexes cho performance
create index if not exists orders_user_id_idx      on public.orders (user_id);
create index if not exists orders_user_email_idx   on public.orders (user_email);
create index if not exists orders_status_idx       on public.orders (status);
create index if not exists orders_created_idx      on public.orders (created_at desc);
create index if not exists orders_instance_idx     on public.orders (instance_id) where instance_id is not null;

-- 5) Audit log cho orders
create table if not exists public.order_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  action          text not null,     -- 'created', 'status_changed', 'provisioned'
  old_status      order_status,
  new_status      order_status,
  performed_by    uuid references auth.users(id),
  performed_at    timestamptz not null default now(),
  details         jsonb
);

create index if not exists audit_order_id_idx on public.order_audit_logs (order_id);
create index if not exists audit_performed_idx on public.order_audit_logs (performed_at desc);

-- Trigger audit log khi orders thay đổi
create or replace function public.log_order_changes() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.order_audit_logs (order_id, action, new_status, performed_by)
    values (NEW.id, 'created', NEW.status, NEW.user_id);
  elsif TG_OP = 'UPDATE' and OLD.status != NEW.status then
    insert into public.order_audit_logs (order_id, action, old_status, new_status, performed_by)
    values (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_orders_audit on public.orders;
create trigger trg_orders_audit
  after insert or update on public.orders
  for each row execute function public.log_order_changes();

-- 6) Rate limiting: 1 user chỉ tạo tối đa 5 đơn pending mỗi ngày
create or replace function public.check_order_rate_limit() returns trigger as $$
declare
  pending_count int;
begin
  select count(*) into pending_count
  from public.orders
  where user_id = NEW.user_id
    and status = 'pending'
    and created_at > now() - interval '24 hours';
  
  if pending_count >= 5 then
    raise exception 'Bạn đã tạo quá nhiều đơn chờ xác nhận. Vui lòng liên hệ support.';
  end if;
  
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_check_rate_limit on public.orders;
create trigger trg_check_rate_limit
  before insert on public.orders
  for each row execute function public.check_order_rate_limit();

-- 7) Trigger updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin NEW.updated_at = now(); return NEW; end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.user_profiles;
create trigger trg_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- 8) RLS — SECURITY FIRST
alter table public.orders enable row level security;
alter table public.user_profiles enable row level security;
alter table public.order_audit_logs enable row level security;

-- Helper function: check if user is admin
create or replace function public.is_admin() returns boolean as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$ language sql security definer;

-- Orders policies
drop policy if exists "Users can read own orders" on public.orders;
drop policy if exists "Users can insert own orders" on public.orders;
drop policy if exists "Admins can read all orders" on public.orders;
drop policy if exists "Admins can update all orders" on public.orders;

create policy "Users can read own orders" on public.orders
  for select using (auth.uid() = user_id or is_admin());

create policy "Users can insert own orders" on public.orders
  for insert with check (auth.uid() = user_id);

create policy "Admins can read all orders" on public.orders
  for select using (is_admin());

create policy "Admins can update all orders" on public.orders
  for update using (is_admin());

-- Profiles policies
drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;

create policy "Users can read own profile" on public.user_profiles
  for select using (auth.uid() = id or is_admin());

create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id);

-- Audit logs policies
drop policy if exists "Admins can read audit logs" on public.order_audit_logs;
create policy "Admins can read audit logs" on public.order_audit_logs
  for select using (is_admin());

-- 9) RPC Functions — ADMIN ONLY
create or replace function admin_list_orders()
returns table (
  id uuid, user_id uuid, user_email text, package_id text, package_name text,
  region text, cycle text, amount_vnd bigint, status order_status,
  vps_ip text, vps_password text, vps_username text, instance_id text, hostname text,
  admin_notes text, created_at timestamptz, updated_at timestamptz, provisioned_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Access denied: admin role required';
  end if;
  
  return query
  select o.id, o.user_id, o.user_email, o.package_id, o.package_name,
         o.region, o.cycle, o.amount_vnd, o.status,
         o.vps_ip, o.vps_password, o.vps_username, o.instance_id, o.hostname,
         o.admin_notes, o.created_at, o.updated_at, o.provisioned_at
  from public.orders o
  order by o.created_at desc;
end;
$$;

create or replace function admin_provision_order(
  p_order_id uuid,
  p_instance_id text,
  p_hostname text,
  p_vps_username text default 'root',
  p_admin_notes text default null
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not is_admin() then
    raise exception 'Access denied: admin role required';
  end if;
  
  update public.orders
  set instance_id = p_instance_id,
      hostname = p_hostname,
      vps_username = p_vps_username,
      admin_notes = p_admin_notes,
      status = 'provisioned',
      provisioned_at = now(),
      provisioned_by = auth.uid()
  where id = p_order_id
  returning * into v_order;
  
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;
  
  return v_order;
end;
$$;

create or replace function admin_update_status(
  p_order_id uuid,
  p_status order_status
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not is_admin() then
    raise exception 'Access denied: admin role required';
  end if;
  
  update public.orders
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
      confirmed_by = case when p_status = 'confirmed' then auth.uid() else confirmed_by end
  where id = p_order_id
  returning * into v_order;
  
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;
  
  return v_order;
end;
$$;

create or replace function admin_stats()
returns json
language sql security definer set search_path = public
as $$
  select json_build_object(
    'total',       (select count(*) from orders),
    'pending',     (select count(*) from orders where status = 'pending'),
    'confirmed',   (select count(*) from orders where status = 'confirmed'),
    'provisioned', (select count(*) from orders where status = 'provisioned'),
    'cancelled',   (select count(*) from orders where status = 'cancelled'),
    'revenue',     coalesce((select sum(amount_vnd) from orders where status = 'provisioned'), 0),
    'today',       (select count(*) from orders where created_at::date = current_date),
    'this_month',  (select count(*) from orders where date_trunc('month', created_at) = date_trunc('month', current_date))
  );
$$;

-- 10) Grant permissions
grant usage on schema public to anon, authenticated;
grant select on public.user_profiles to authenticated;
grant select, insert on public.orders to authenticated;
grant update on public.orders to authenticated;  -- chỉ qua RLS

grant execute on function admin_list_orders() to authenticated;
grant execute on function admin_provision_order(uuid, text, text, text, text) to authenticated;
grant execute on function admin_update_status(uuid, order_status) to authenticated;
grant execute on function admin_stats() to authenticated;
grant execute on function is_admin() to authenticated;

-- 11) Verify
select 'Production setup complete ✓' as status,
       (select count(*) from public.orders) as orders_count,
       (select count(*) from public.user_profiles) as profiles_count;
