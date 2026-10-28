import type { ActivityStatus, ActivityType } from './types'

export const TYPE_ORDER: ActivityType[] = ['meeting', 'email', 'proposal', 'call', 'event', 'other']

export const TYPE_META: Record<ActivityType, { label: string; color: string; placeholder: string }> = {
  meeting: {
    label: '미팅',
    color: '#2563eb',
    placeholder: '협의 내용과 고객 반응을 입력합니다.',
  },
  email: {
    label: '이메일',
    color: '#16a34a',
    placeholder: '전달 내용과 후속 조치를 입력합니다.',
  },
  proposal: {
    label: '제안',
    color: '#7c3aed',
    placeholder: '제안 내용과 고객 피드백을 입력합니다.',
  },
  call: {
    label: '전화',
    color: '#d97706',
    placeholder: '통화 내용과 확인 사항을 입력합니다.',
  },
  event: {
    label: '행사',
    color: '#e11d48',
    placeholder: '상담 내용과 후속 계획을 입력합니다.',
  },
  other: {
    label: '기타',
    color: '#71717a',
    placeholder: '내부 검토, 방문, 지원 등 내용을 입력합니다.',
  },
}

export const PURPOSES: Record<ActivityType, { id: string; label: string }[]> = {
  meeting: [
    { id: 'intro', label: '최초 미팅' },
    { id: 'tech', label: '기술 협의' },
    { id: 'requirements', label: '요구사항 확인' },
    { id: 'business', label: '사업 논의' },
  ],
  email: [
    { id: 'materials', label: '자료 전달' },
    { id: 'proposal_sent', label: '제안서 발송' },
    { id: 'reply', label: '문의 회신' },
    { id: 'followup', label: '후속 연락' },
  ],
  call: [
    { id: 'schedule', label: '일정 조율' },
    { id: 'progress', label: '진행상황 확인' },
    { id: 'request', label: '고객 요청 대응' },
  ],
  proposal: [
    { id: 'solution', label: '솔루션 소개' },
    { id: 'business', label: '사업 제안' },
    { id: 'quote', label: '견적 전달' },
    { id: 'partnership', label: '협력 제안' },
  ],
  event: [
    { id: 'expo', label: '전시회 참가' },
    { id: 'conference', label: '컨퍼런스' },
    { id: 'networking', label: '네트워킹' },
    { id: 'consult', label: '상담회' },
  ],
  other: [
    { id: 'internal', label: '내부 검토' },
    { id: 'visit', label: '고객 방문' },
    { id: 'support', label: '기술 지원' },
  ],
}

export const STATUS_META: Record<ActivityStatus, { label: string }> = {
  planned: { label: '예정' },
  done: { label: '완료' },
  postponed: { label: '연기' },
}

export function purposeLabel(type: ActivityType, id: string) {
  return PURPOSES[type].find((item) => item.id === id)?.label ?? ''
}

export function autoTitle(input: {
  type: ActivityType | null
  companyName?: string | null
  purposeLabel?: string | null
}) {
  const company = input.companyName?.trim() ?? ''
  const purpose = input.purposeLabel?.trim() ?? ''
  const typeLabel = input.type ? TYPE_META[input.type].label : ''
  if (company && purpose) return `${company} ${purpose}`
  if (company && typeLabel) return `${company} ${typeLabel}`
  if (purpose) return purpose
  return typeLabel
}
