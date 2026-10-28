-- 사업 관리 추가분
-- 기존 스키마를 이미 실행한 프로젝트에서 이 파일만 SQL Editor로 한 번 실행합니다.
-- 예시 데이터는 넣지 않습니다.
-- 승인된 팀원은 사업과 일정을 조회·등록·수정할 수 있습니다.
-- 사업 행 삭제는 관리자만 가능합니다.
-- 대상 담당자·관계자 연결 변경과 일정 삭제는 수정으로 보아 승인된 팀원도 가능합니다.

begin;
do $$ begin
  create type public.business_type as enum ('government', 'b2b', 'b2g', 'rnd', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.business_status as enum ('preparing', 'active', 'paused', 'done', 'stopped');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.milestone_kind as enum ('schedule', 'milestone');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.milestone_status as enum ('planned', 'done');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  overview text not null default '',
  type public.business_type not null,
  status public.business_status not null default 'preparing',
  start_date date not null,
  end_date date not null,
  company_id uuid not null references public.companies (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_name check (length(trim(name)) > 0),
  constraint businesses_date_order check (end_date >= start_date)
);

create table if not exists public.business_targets (
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  primary key (business_id, contact_id)
);

create table if not exists public.business_stakeholders (
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  primary key (business_id, contact_id)
);

create table if not exists public.business_milestones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  milestone_date date not null,
  kind public.milestone_kind not null,
  memo text not null default '',
  status public.milestone_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_milestones_title check (length(trim(title)) > 0)
);

create index if not exists businesses_company_id_idx on public.businesses (company_id);
create index if not exists businesses_start_date_idx on public.businesses (start_date);
create index if not exists business_targets_contact_id_idx on public.business_targets (contact_id);
create index if not exists business_stakeholders_contact_id_idx on public.business_stakeholders (contact_id);
create index if not exists business_milestones_business_id_idx on public.business_milestones (business_id, milestone_date);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at before update on public.businesses
for each row execute function public.set_updated_at();

drop trigger if exists business_milestones_set_updated_at on public.business_milestones;
create trigger business_milestones_set_updated_at before update on public.business_milestones
for each row execute function public.set_updated_at();

create or replace function public.clear_business_targets_when_company_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    delete from public.business_targets where business_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_clear_targets on public.businesses;
create trigger businesses_clear_targets
before update of company_id on public.businesses
for each row execute function public.clear_business_targets_when_company_changes();

create or replace function public.enforce_business_target_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  business_company uuid;
  contact_company uuid;
begin
  select company_id into business_company from public.businesses where id = new.business_id;
  select company_id into contact_company from public.contacts where id = new.contact_id;
  if business_company is null or business_company is distinct from contact_company then
    raise exception '????대떦?먮뒗 ???怨좉컼???뚯냽?댁뼱???⑸땲??';
  end if;
  return new;
end;
$$;

drop trigger if exists business_targets_same_company on public.business_targets;
create trigger business_targets_same_company
before insert or update on public.business_targets
for each row execute function public.enforce_business_target_company();

alter table public.businesses enable row level security;
alter table public.business_targets enable row level security;
alter table public.business_stakeholders enable row level security;
alter table public.business_milestones enable row level security;

grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.business_targets to authenticated;
grant select, insert, update, delete on public.business_stakeholders to authenticated;
grant select, insert, update, delete on public.business_milestones to authenticated;

revoke all on public.businesses from anon;
revoke all on public.business_targets from anon;
revoke all on public.business_stakeholders from anon;
revoke all on public.business_milestones from anon;

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
for select to authenticated
using (public.is_approved());

drop policy if exists businesses_insert on public.businesses;
create policy businesses_insert on public.businesses
for insert to authenticated
with check (public.is_approved());

drop policy if exists businesses_update on public.businesses;
create policy businesses_update on public.businesses
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists businesses_delete on public.businesses;
create policy businesses_delete on public.businesses
for delete to authenticated
using (public.is_admin());

drop policy if exists business_targets_select on public.business_targets;
create policy business_targets_select on public.business_targets
for select to authenticated
using (public.is_approved());

drop policy if exists business_targets_insert on public.business_targets;
create policy business_targets_insert on public.business_targets
for insert to authenticated
with check (public.is_approved());

drop policy if exists business_targets_delete on public.business_targets;
create policy business_targets_delete on public.business_targets
for delete to authenticated
using (public.is_approved());

drop policy if exists business_stakeholders_select on public.business_stakeholders;
create policy business_stakeholders_select on public.business_stakeholders
for select to authenticated
using (public.is_approved());

drop policy if exists business_stakeholders_insert on public.business_stakeholders;
create policy business_stakeholders_insert on public.business_stakeholders
for insert to authenticated
with check (public.is_approved());

drop policy if exists business_stakeholders_delete on public.business_stakeholders;
create policy business_stakeholders_delete on public.business_stakeholders
for delete to authenticated
using (public.is_approved());

drop policy if exists business_milestones_select on public.business_milestones;
create policy business_milestones_select on public.business_milestones
for select to authenticated
using (public.is_approved());

drop policy if exists business_milestones_insert on public.business_milestones;
create policy business_milestones_insert on public.business_milestones
for insert to authenticated
with check (public.is_approved());

drop policy if exists business_milestones_update on public.business_milestones;
create policy business_milestones_update on public.business_milestones
for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists business_milestones_delete on public.business_milestones;
create policy business_milestones_delete on public.business_milestones
for delete to authenticated
using (public.is_approved());

commit;


