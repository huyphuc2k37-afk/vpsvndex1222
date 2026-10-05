-- VPSVNDEX orders and instances. Run in Supabase SQL editor.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  package_id text not null,
  package_name text not null,
  region text not null check (region in ('vn', 'us')),
  cycle text not null default '1m' check (cycle in ('1m', '3m', '12m')),
  amount_vnd bigint not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'provisioned', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instances (
  instance_id uuid primary key default gen_random_uuid(),
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

drop policy if exists "orders_read_own" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "instances_read_own" on public.instances;
create policy "orders_read_own" on public.orders for select to authenticated using (user_id = auth.uid());
create policy "orders_insert_own" on public.orders for insert to authenticated with check (user_id = auth.uid());
create policy "instances_read_own" on public.instances for select to authenticated using (user_id = auth.uid());

revoke update, delete on public.orders from authenticated;
revoke insert, update, delete on public.instances from authenticated;
grant select, insert on public.orders to authenticated;
grant select on public.instances to authenticated;

create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
