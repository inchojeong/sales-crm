import type { Activity } from './types'

/** 같은 고객사에서 가장 최근 활동에 쓰인 담당자를 돌려줍니다. 지금 존재하는 담당자만 포함합니다. */
export function lastContactIds(companyId: string, activities: Activity[], valid: Set<string>) {
  const recent = activities
    .filter((activity) => activity.companyId === companyId && activity.contactIds.some((id) => valid.has(id)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0]
  if (!recent) return []
  return recent.contactIds.filter((id) => valid.has(id))
}

/** 이름만 입력해도 담당자로 등록할 수 있게 "이름 직급" 형태를 나눕니다. */
export function splitPersonText(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  return { name: parts[0] ?? '', position: parts.slice(1).join(' ') }
}
