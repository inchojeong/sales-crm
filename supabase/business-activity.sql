-- 영업활동과 사업 연결
-- supabase/business.sql 을 실행한 뒤, 이 파일을 SQL Editor에서 한 번 실행합니다.
-- 예시 데이터는 넣지 않습니다.
-- 사업이 삭제되어도 영업활동은 남고, 연결만 해제됩니다.
-- 승인된 팀원의 기존 영업활동 수정 권한으로 연결을 바꾸며, 새 정책은 없습니다.

begin;

alter table public.activities
  add column if not exists business_id uuid null references public.businesses (id) on delete set null;

create index if not exists activities_business_id_idx on public.activities (business_id);

commit;
