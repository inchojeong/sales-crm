-- 사업전략팀 CRM 스키마
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- 예시 영업 데이터는 넣지 않습니다. 승인은 approved_emails에 이메일을 넣은 뒤
-- Authentication 화면에서 사용자를 만들면 반영됩니다.

begin;

do $$ begin
  create type public.app_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum ('meeting', 'email', 'proposal', 'call', 'event', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_status as enum ('planned', 'done', 'postponed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.approved_emails (
  email text primary key,
  display_name text not null,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  constraint approved_emails_lowercase check (email = lower(email)),
  constraint approved_emails_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint approved_emails_name check (length(trim(display_name)) > 0)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role public.app_role not null default 'member',
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email)),
  constraint profiles_name check (length(trim(display_name)) > 0)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null default '',
  website text not null default '',
  phone text not null default '',
  address text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name check (length(trim(name)) > 0)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  department text not null default '',
  position text not null default '',
  email text not null default '',
  phone text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name check (length(trim(name)) > 0)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  place text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_name check (length(trim(name)) > 0),
  constraint events_date_order check (end_date >= start_date)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_date date not null,
  start_time time null,
  end_time time null,
  type public.activity_type not null,
  title text not null,
  company_id uuid null references public.companies (id) on delete restrict,
  event_id uuid null references public.events (id) on delete restrict,
  purpose text not null,
  status public.activity_status not null,
  notes text not null default '',
  author_id uuid null references public.profiles (id) on delete restrict,
  related_activity_id uuid null references public.activities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_title check (length(trim(title)) > 0),
  constraint activities_purpose check (length(trim(purpose)) > 0),
  constraint activities_not_self check (related_activity_id is distinct from id)
);

create table if not exists public.activity_contacts (
  activity_id uuid not null references public.activities (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  primary key (activity_id, contact_id)
);

create index if not exists contacts_company_id_idx on public.contacts (company_id);
create index if not exists activities_date_idx on public.activities (activity_date);
create index if not exists activities_company_id_idx on public.activities (company_id);
create index if not exists activities_event_id_idx on public.activities (event_id);
create index if not exists activities_author_id_idx on public.activities (author_id);
create index if not exists activities_related_id_idx on public.activities (related_activity_id);
create index if not exists activity_contacts_contact_id_idx on public.activity_contacts (contact_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- 로그인 사용자가 SQL Editor가 아닐 때 작성자를 고정합니다.
create or replace function public.preserve_activity_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.author_id is distinct from auth.uid() then
    raise exception '작성자는 로그인한 사용자여야 합니다.';
  end if;
  if tg_op = 'UPDATE' and new.author_id is distinct from old.author_id then
    raise exception '작성자는 변경할 수 없습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists activities_preserve_author on public.activities;
create trigger activities_preserve_author
before insert or update on public.activities
for each row execute function public.preserve_activity_author();

-- 고객사가 바뀌면 이전 고객사의 담당자 연결을 제거합니다.
create or replace function public.clear_contacts_when_company_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    delete from public.activity_contacts where activity_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_clear_contacts on public.activities;
create trigger activities_clear_contacts
before update of company_id on public.activities
for each row execute function public.clear_contacts_when_company_changes();

create or replace function public.enforce_activity_contact_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  activity_company uuid;
  contact_company uuid;
begin
  select company_id into activity_company from public.activities where id = new.activity_id;
  select company_id into contact_company from public.contacts where id = new.contact_id;
  if activity_company is null then
    raise exception '고객사가 없는 영업활동에는 담당자를 연결할 수 없습니다.';
  end if;
  if activity_company is distinct from contact_company then
    raise exception '담당자는 해당 고객사 소속이어야 합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists activity_contacts_same_company on public.activity_contacts;
create trigger activity_contacts_same_company
before insert or update on public.activity_contacts
for each row execute function public.enforce_activity_contact_company();

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and approved = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and approved = true and role = 'admin'
  );
$$;

revoke all on function public.is_approved() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 승인 명단에 있는 이메일만 승인된 프로필이 됩니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.approved_emails%rowtype;
  normalized text := lower(coalesce(new.email, ''));
begin
  select * into invite from public.approved_emails where email = normalized;
  insert into public.profiles (id, email, display_name, role, approved)
  values (
    new.id,
    normalized,
    coalesce(nullif(trim(invite.display_name), ''), split_part(normalized, '@', 1)),
    coalesce(invite.role, 'member'),
    invite.email is not null
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        approved = excluded.approved,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 스키마보다 먼저 만들어진 계정이 있으면 프로필을 채웁니다.
insert into public.profiles (id, email, display_name, role, approved)
select
  users.id,
  lower(users.email),
  coalesce(nullif(trim(approved_emails.display_name), ''), split_part(lower(users.email), '@', 1)),
  coalesce(approved_emails.role, 'member'),
  approved_emails.email is not null
from auth.users as users
left join public.approved_emails
  on approved_emails.email = lower(users.email)
where users.email is not null
on conflict (id) do nothing;

alter table public.approved_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.activities enable row level security;
alter table public.activity_contacts enable row level security;

grant select, insert, update, delete on public.approved_emails to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.activity_contacts to authenticated;

revoke all on public.approved_emails from anon;
revoke all on public.profiles from anon;
revoke all on public.companies from anon;
revoke all on public.contacts from anon;
revoke all on public.events from anon;
revoke all on public.activities from anon;
revoke all on public.activity_contacts from anon;

drop policy if exists approved_emails_admin_all on public.approved_emails;
create policy approved_emails_admin_all on public.approved_emails
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles
for select to authenticated
using (public.is_approved());

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select to authenticated
using (public.is_approved());

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
for insert to authenticated
with check (public.is_approved());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies
for delete to authenticated
using (public.is_admin());

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
for select to authenticated
using (public.is_approved());

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
for insert to authenticated
with check (public.is_approved());

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
for delete to authenticated
using (public.is_admin());

drop policy if exists events_select on public.events;
create policy events_select on public.events
for select to authenticated
using (public.is_approved());

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
for insert to authenticated
with check (public.is_approved());

drop policy if exists events_update on public.events;
create policy events_update on public.events
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
for delete to authenticated
using (public.is_admin());

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
for select to authenticated
using (public.is_approved());

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
for insert to authenticated
with check (public.is_approved());

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities
for delete to authenticated
using (public.is_admin());

drop policy if exists activity_contacts_select on public.activity_contacts;
create policy activity_contacts_select on public.activity_contacts
for select to authenticated
using (public.is_approved());

drop policy if exists activity_contacts_insert on public.activity_contacts;
create policy activity_contacts_insert on public.activity_contacts
for insert to authenticated
with check (public.is_approved());

drop policy if exists activity_contacts_update on public.activity_contacts;
create policy activity_contacts_update on public.activity_contacts
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

-- 담당자 연결 변경은 영업활동 수정입니다. 고객사·담당자·행사·영업활동 행 삭제는 관리자만 가능합니다.
drop policy if exists activity_contacts_delete on public.activity_contacts;
create policy activity_contacts_delete on public.activity_contacts
for delete to authenticated
using (public.is_approved());

commit;

-- 실행 후 관리자 한 명을 승인하려면, 이메일만 바꿔 아래를 따로 실행한 뒤
-- Authentication > Users > Add user 에서 같은 이메일로 계정을 만듭니다.
-- Auto Confirm User 를 켭니다.
--
-- insert into public.approved_emails (email, display_name, role)
-- values ('admin@example.com', '관리자', 'admin');
--
-- 이미 만든 계정을 승인 명단에 나중에 올릴 때는 사용자 생성 트리거가 다시 실행되지 않습니다.
-- 명단을 넣은 뒤 아래를 실행합니다.
--
-- update public.profiles as profiles
-- set role = approved_emails.role,
--     display_name = approved_emails.display_name,
--     approved = true,
--     updated_at = now()
-- from public.approved_emails
-- where profiles.email = approved_emails.email;
