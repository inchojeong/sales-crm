export type ActivityType = 'meeting' | 'email' | 'proposal' | 'call' | 'event' | 'other'

export type ActivityStatus = 'planned' | 'done' | 'postponed'

export interface Company {
  id: string
  name: string
  industry: string
  website: string
  phone: string
  address: string
  summary: string
  /** 관계 구분 (예: 데이터바우처 과거 고객) */
  relation?: string
  /** 사업자등록번호. 중복 확인의 우선 기준입니다. */
  businessNo?: string
  needsReview?: boolean
  reviewNote?: string
  lastContact?: string | null
  /** 우선순위 (높음·보통·낮음) */
  priority?: string
  source?: string
}

export interface Contact {
  id: string
  companyId: string
  name: string
  department: string
  position: string
  email: string
  phone: string
  memo: string
}

export interface SalesEvent {
  id: string
  name: string
  startDate: string
  endDate: string
  place: string
  memo: string
}

export interface Activity {
  id: string
  date: string
  type: ActivityType
  title: string
  companyId: string | null
  contactIds: string[]
  eventId: string | null
  businessId: string | null
  purpose: string
  status: ActivityStatus
  notes: string
  opinion: string
  startTime: string | null
  endTime: string | null
  authorId: string
  relatedActivityId: string | null
  createdAt: string
  updatedAt: string
}

export interface DB {
  companies: Company[]
  contacts: Contact[]
  events: SalesEvent[]
  activities: Activity[]
}

export interface CompanyInput {
  id?: string
  name: string
  industry: string
  website: string
  phone: string
  address: string
  summary: string
  relation?: string
  businessNo?: string
  needsReview?: boolean
  reviewNote?: string
  lastContact?: string | null
  priority?: string
  source?: string
}

export interface ContactInput {
  id?: string
  companyId: string
  name: string
  department: string
  position: string
  email: string
  phone: string
  memo: string
}

export interface EventInput {
  id?: string
  name: string
  startDate: string
  endDate: string
  place: string
  memo: string
}

export interface ActivityInput {
  id?: string
  date: string
  type: ActivityType
  title: string
  companyId: string | null
  contactIds: string[]
  eventId: string | null
  businessId?: string | null
  newEventName?: string
  purpose: string
  status: ActivityStatus
  notes: string
  opinion?: string
  startTime?: string | null
  endTime?: string | null
  relatedActivityId: string | null
}

export interface CreatePrefill {
  date: string
  companyId?: string | null
  contactIds?: string[]
  eventId?: string | null
  businessId?: string | null
  type?: ActivityType
  startTime?: string
}

export type DialogRequest =
  | ({ mode: 'create' } & CreatePrefill)
  | { mode: 'edit'; activityId: string }
  | { mode: 'followup'; activityId: string }
