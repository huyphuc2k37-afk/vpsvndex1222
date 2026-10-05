-- VPSVNDEX admin and simulator integration migration.
-- Set auth.users.app_metadata.role = 'admin' for operator accounts.

alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.orders add column if not exists updated_at timestamptz default now();
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'confirmed', 'provisioned', 'cancelled'));

create table if not exists public.instances (
  instance_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  hostname text not null unique,
  plan_id text not null,
  status text not null default 'running' check (status in ('running', 'stopped')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  terminal_url text not null,
  username text not null default 'root'
);

alter table public.orders enable row level security;
alter table public.instances enable row level security;
revoke all on public.orders from anon;
revoke all on public.instances from anon;

drop policy if exists orders_read_own on public.orders;
drop policy if exists orders_insert_own on public.orders;
drop policy if exists instances_read_own on public.instances;
create policy orders_read_own on public.orders for select to authenticated using (user_id = auth.uid());
create policy orders_insert_own on public.orders for insert to authenticated with check (user_id = auth.uid());
create policy instances_read_own on public.instances for select to authenticated using (user_id = auth.uid());
revoke update, delete on public.orders from authenticated;
revoke insert, update, delete on public.instances from authenticated;
grant select, insert on public.orders to authenticated;
grant select on public.instances to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql security definer set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.admin_list_orders()
returns setof public.orders
language sql security definer set search_path = public
as $$ select * from public.orders where public.is_admin() order by created_at desc; $$;

create or replace function public.admin_update_status(p_order_id uuid, p_status text)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare result public.orders;
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  update public.orders set status = p_status where id = p_order_id returning * into result;
  return result;
end; $$;

create or replace function public.admin_stats()
returns json
language sql security definer set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'confirmed', count(*) filter (where status = 'confirmed'),
    'provisioned', count(*) filter (where status = 'provisioned'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'revenue', coalesce(sum(amount_vnd) filter (where status = 'provisioned'), 0)
  ) else json_build_object('error', 'admin access required') end
  from public.orders;
$$;

revoke all on function public.admin_list_orders() from public;
revoke all on function public.admin_update_status(uuid, text) from public;
revoke all on function public.admin_stats() from public;
grant execute on function public.admin_list_orders() to authenticated;
grant execute on function public.admin_update_status(uuid, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;
