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
  purpose: string
  status: ActivityStatus
  notes: string
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
  newEventName?: string
  purpose: string
  status: ActivityStatus
  notes: string
  startTime?: string | null
  endTime?: string | null
  relatedActivityId: string | null
}

export interface CreatePrefill {
  date: string
  companyId?: string | null
  contactIds?: string[]
  eventId?: string | null
  type?: ActivityType
  startTime?: string
}

export type DialogRequest =
  | ({ mode: 'create' } & CreatePrefill)
  | { mode: 'edit'; activityId: string }
  | { mode: 'followup'; activityId: string }
