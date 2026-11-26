-- 사업기회 중심 개편용 확장 (고객사·사업 이력 항목, 영업기회).
-- Supabase SQL Editor에서 한 번 실행합니다. 여러 번 실행해도 안전합니다.
-- 실행하기 전에도 앱은 동작하며, 실행하면 새 항목이 자동으로 켜집니다.

-- 1) 고객사 확장 항목
alter table public.companies add column if not exists relation text not null default '';
alter table public.companies add column if not exists business_no text not null default '';
alter table public.companies add column if not exists needs_review boolean not null default false;
alter table public.companies add column if not exists review_note text not null default '';
alter table public.companies add column if not exists last_contact date;
alter table public.companies add column if not exists priority text not null default '';
alter table public.companies add column if not exists source text not null default '';

-- 2) 사업 이력 확장 항목
alter table public.businesses add column if not exists program text not null default '';
alter table public.businesses add column if not exists item text not null default '';
alter table public.businesses add column if not exists fiscal_year text not null default '';
alter table public.businesses add column if not exists outcome text not null default 'unknown';
alter table public.businesses add column if not exists my_role text not null default '';
alter table public.businesses add column if not exists evidence text not null default '';
alter table public.businesses add column if not exists review_note text not null default '';
alter table public.businesses add column if not exists needs_review boolean not null default false;
alter table public.businesses add column if not exists amount text not null default '';
alter table public.businesses add column if not exists matching_route text not null default '';
alter table public.businesses add column if not exists lessons text not null default '';
alter table public.businesses add column if not exists source text not null default '';

do $$ begin
  alter table public.businesses
    add constraint businesses_outcome_check
    check (outcome in ('unknown', 'applied', 'selected', 'not_selected', 'running', 'completed', 'dropped'));
exception
  when duplicate_object then null;
end $$;

-- 3) 영업기회
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  business_id uuid references public.businesses (id) on delete set null,
  title text not null,
  stage text not null default 'discovery',
  owner_id uuid references public.profiles (id) on delete set null,
  next_date date,
  amount text not null default '',
  memo text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_title check (length(trim(title)) > 0),
  constraint opportunities_stage check (stage in ('discovery', 'matching', 'discussion', 'proposal', 'contract', 'execution'))
);

create index if not exists opportunities_company_id_idx on public.opportunities (company_id);
create index if not exists opportunities_stage_idx on public.opportunities (stage) where not archived;

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;

grant select, insert, update, delete on public.opportunities to authenticated;
revoke all on public.opportunities from anon;

drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities
for select to authenticated
using (public.is_approved());

drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities
for insert to authenticated
with check (public.is_approved());

drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

-- 영업기회 삭제는 관리자만 가능합니다. 일반 팀원은 '보관'으로 정리합니다.
drop policy if exists opportunities_delete on public.opportunities;
create policy opportunities_delete on public.opportunities
for delete to authenticated
using (public.is_admin());
