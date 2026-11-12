-- SiRinci V1.0 - Supabase Gmail-only setup
-- Jalankan sekali melalui Supabase SQL Editor.
-- Tidak membutuhkan OWNER_GOOGLE_EMAIL.
-- Gmail pertama yang login mendapat ruang keuangan sendiri sebagai Admin.

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Keuangan Saya',
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text not null default 'Anggota',
  role text not null default 'Member' check (role in ('Admin','Member')),
  active boolean not null default true,
  reminder_email text,
  created_at timestamptz not null default now(),
  unique(household_id,email)
);
drop index if exists public.household_members_one_household_per_user;
create unique index if not exists household_members_one_active_household_per_user
  on public.household_members(user_id) where user_id is not null and active=true;

create table if not exists public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  app_name text not null default 'SiRinci',
  household_name text not null default 'Keuangan Saya',
  timezone text not null default 'Asia/Jakarta',
  version text not null default '1.0.0',
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  opening_balance numeric(18,2) not null default 0,
  type text not null default 'Bank',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(household_id,name)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check(type in ('Pemasukan','Pengeluaran')),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(household_id,type,name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  type text not null check(type in ('Pemasukan','Pengeluaran','Transfer')),
  category text,
  description text,
  account text not null,
  to_account text,
  amount numeric(18,2) not null check(amount>0),
  receipt_path text,
  member_id uuid references public.household_members(id) on delete set null,
  member_name text,
  member_email text,
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists transactions_household_date_idx on public.transactions(household_id,date desc);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month text not null check(month ~ '^[0-9]{4}-[0-9]{2}$'),
  category text not null,
  amount numeric(18,2) not null default 0,
  active boolean not null default true,
  unique(household_id,month,category)
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text,
  amount numeric(18,2) not null default 0,
  account text not null,
  due_day integer not null default 1 check(due_day between 1 and 31),
  last_paid_month text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_household_member(p_household uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id=p_household
      and m.user_id=auth.uid()
      and m.active=true
  );
$$;

create or replace function public.is_household_admin(p_household uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id=p_household
      and m.user_id=auth.uid()
      and m.active=true
      and m.role='Admin'
  );
$$;

create or replace function public.bootstrap_google_user()
returns uuid
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_hid uuid;
  v_invite uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select lower(coalesce(email,'')),
         coalesce(nullif(raw_user_meta_data->>'full_name',''),
                  nullif(raw_user_meta_data->>'name',''),
                  split_part(coalesce(email,''),'@',1),
                  'Pengguna')
    into v_email,v_name
  from auth.users
  where id=v_uid;

  if coalesce(v_email,'')='' then raise exception 'EMAIL_REQUIRED'; end if;

  select household_id into v_hid
  from public.household_members
  where user_id=v_uid and active=true
  order by created_at
  limit 1;
  if v_hid is not null then return v_hid; end if;

  select id,household_id into v_invite,v_hid
  from public.household_members
  where user_id is null and lower(email)=v_email and active=true
  order by created_at
  limit 1;

  if v_invite is not null then
    update public.household_members
       set user_id=v_uid,
           name=case when trim(name)='' or name='Anggota' then v_name else name end,
           reminder_email=coalesce(nullif(reminder_email,''),v_email)
     where id=v_invite;
    return v_hid;
  end if;

  insert into public.households(name,owner_id)
  values('Keuangan '||v_name,v_uid)
  returning id into v_hid;

  insert into public.household_members(household_id,user_id,email,name,role,active,reminder_email)
  values(v_hid,v_uid,v_email,v_name,'Admin',true,v_email);

  insert into public.household_settings(household_id,household_name)
  values(v_hid,'Keuangan '||v_name)
  on conflict(household_id) do nothing;

  insert into public.accounts(household_id,name,type,opening_balance) values
    (v_hid,'Cash','Cash',0),
    (v_hid,'Rekening Utama','Bank',0),
    (v_hid,'E-Wallet','E-Wallet',0)
  on conflict do nothing;

  insert into public.categories(household_id,type,name) values
    (v_hid,'Pemasukan','Gaji'),
    (v_hid,'Pemasukan','Bonus'),
    (v_hid,'Pemasukan','Pendapatan Lain'),
    (v_hid,'Pengeluaran','Belanja'),
    (v_hid,'Pengeluaran','Makanan'),
    (v_hid,'Pengeluaran','Transportasi'),
    (v_hid,'Pengeluaran','Pendidikan'),
    (v_hid,'Pengeluaran','Kesehatan'),
    (v_hid,'Pengeluaran','Listrik & Utilitas'),
    (v_hid,'Pengeluaran','Hiburan'),
    (v_hid,'Pengeluaran','Cicilan'),
    (v_hid,'Pengeluaran','Lain-lain')
  on conflict do nothing;

  return v_hid;
end $$;

create or replace function public.add_household_member(
  p_email text,
  p_name text,
  p_role text default 'Member',
  p_reminder_email text default null
)
returns uuid
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_hid uuid;
  v_id uuid;
  v_target uuid;
  v_existing uuid;
  v_email text:=lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select household_id into v_hid
  from public.household_members
  where user_id=auth.uid() and active=true and role='Admin'
  limit 1;

  if v_hid is null then raise exception 'PERMISSION_DENIED'; end if;
  if v_email='' then raise exception 'EMAIL_REQUIRED'; end if;

  select id into v_target from auth.users where lower(email)=v_email limit 1;

  if v_target is not null then
    select household_id into v_existing
    from public.household_members
    where user_id=v_target and active=true
    limit 1;
    if v_existing is not null and v_existing<>v_hid then
      raise exception 'USER_ALREADY_IN_ANOTHER_HOUSEHOLD';
    end if;
  end if;

  insert into public.household_members(household_id,user_id,email,name,role,active,reminder_email)
  values(
    v_hid,v_target,v_email,
    coalesce(nullif(trim(p_name),''),split_part(v_email,'@',1)),
    case when p_role='Admin' then 'Admin' else 'Member' end,
    true,
    coalesce(nullif(trim(p_reminder_email),''),v_email)
  )
  on conflict(household_id,email) do update set
    user_id=coalesce(excluded.user_id,public.household_members.user_id),
    name=excluded.name,
    role=excluded.role,
    active=true,
    reminder_email=excluded.reminder_email
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.is_household_member(uuid) from public,anon;
revoke all on function public.is_household_admin(uuid) from public,anon;
revoke all on function public.bootstrap_google_user() from public,anon;
revoke all on function public.add_household_member(text,text,text,text) from public,anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.bootstrap_google_user() to authenticated;
grant execute on function public.add_household_member(text,text,text,text) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_settings enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.bills enable row level security;

do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('households','household_members','household_settings','accounts','categories','transactions','budgets','bills')
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy households_select on public.households
for select to authenticated using(public.is_household_member(id));
create policy households_update on public.households
for update to authenticated
using(public.is_household_admin(id))
with check(public.is_household_admin(id));

create policy members_select on public.household_members
for select to authenticated using(public.is_household_member(household_id));

create policy settings_select on public.household_settings
for select to authenticated using(public.is_household_member(household_id));
create policy settings_update on public.household_settings
for update to authenticated
using(public.is_household_admin(household_id))
with check(public.is_household_admin(household_id));

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','budgets','bills'] loop
    execute format('create policy %I on public.%I for select to authenticated using(public.is_household_member(household_id))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check(public.is_household_member(household_id))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id))',t||'_update',t);
    execute format('create policy %I on public.%I for delete to authenticated using(public.is_household_member(household_id))',t||'_delete',t);
  end loop;
end $$;

create policy transactions_select on public.transactions
for select to authenticated using(public.is_household_member(household_id));
create policy transactions_insert on public.transactions
for insert to authenticated
with check(public.is_household_member(household_id) and created_by=auth.uid());
create policy transactions_update on public.transactions
for update to authenticated
using(public.is_household_admin(household_id) or created_by=auth.uid())
with check(public.is_household_member(household_id) and (public.is_household_admin(household_id) or created_by=auth.uid()));
create policy transactions_delete on public.transactions
for delete to authenticated
using(public.is_household_admin(household_id) or created_by=auth.uid());

revoke all on public.households,public.household_members,public.household_settings,
  public.accounts,public.categories,public.transactions,public.budgets,public.bills
from anon;

grant select,update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select,update on public.household_settings to authenticated;
grant select,insert,update,delete on public.accounts,public.categories,public.transactions,public.budgets,public.bills to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'receipts','receipts',false,5242880,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sirinci_receipts_select on storage.objects;
drop policy if exists sirinci_receipts_insert on storage.objects;
drop policy if exists sirinci_receipts_delete on storage.objects;

create policy sirinci_receipts_select on storage.objects
for select to authenticated
using(
  bucket_id='receipts'
  and public.is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy sirinci_receipts_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='receipts'
  and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2]=auth.uid()::text
);

create policy sirinci_receipts_delete on storage.objects
for delete to authenticated
using(
  bucket_id='receipts'
  and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.is_household_admin(((storage.foldername(name))[1])::uuid)
  )
);
