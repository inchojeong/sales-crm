-- 행사 참여 담당자의 기타 소견
-- 기존 스키마를 실행한 프로젝트에서 이 파일만 SQL Editor로 한 번 실행합니다.
-- 이미 등록된 영업활동은 지우지 않습니다.

begin;

alter table public.activities
  add column if not exists opinion text not null default '';

commit;
