import type { SupabaseClient } from '@supabase/supabase-js'
import { SEED } from './seed'
import { supabase } from './lib/supabase'
import type { Activity, ActivityStatus, ActivityType, DB, SalesEvent } from './types'

const LEGACY_KEY = 'sales-crm-shared-legacy-v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ACTIVITY_COLUMNS =
  'id, activity_date, start_time, end_time, type, title, company_id, event_id, business_id, purpose, status, notes, opinion, author_id, related_activity_id, created_at, updated_at'
const ACTIVITY_COLUMNS_BASIC =
  'id, activity_date, start_time, end_time, type, title, company_id, event_id, purpose, status, notes, author_id, related_activity_id, created_at, updated_at'

const SEED_ACTIVITY_IDS = new Set(SEED.activities.map((activity) => activity.id))

interface LegacyMap {
  events: Record<string, string>
  activities: Record<string, string>
}

interface EventRow {
  id: string
  name: string
  start_date: string
  end_date: string
  place: string
  memo: string
}

interface ActivityRow {
  id: string
  activity_date: string
  start_time: string | null
  end_time: string | null
  type: ActivityType
  title: string
  company_id: string | null
  event_id: string | null
  business_id?: string | null
  purpose: string
  status: ActivityStatus
  notes: string
  opinion?: string
  author_id: string | null
  related_activity_id: string | null
  created_at: string
  updated_at: string
}

interface LinkRow {
  activity_id: string
  contact_id: string
}

export interface ScheduleData {
  events: SalesEvent[]
  activities: Activity[]
}

let extendedColumns: boolean | null = null
let loadTask: Promise<ScheduleData> | null = null

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value))
}

function clock(value: string | null) {
  return value ? value.slice(0, 5) : null
}

function missingColumn(error: { code?: string; message?: string }) {
  return error.code === '42703' || error.code === 'PGRST204' || /opinion|business_id/.test(error.message ?? '')
}

function readLegacy(): LegacyMap {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return { events: {}, activities: {} }
    const parsed = JSON.parse(raw) as Partial<LegacyMap>
    return { events: parsed.events ?? {}, activities: parsed.activities ?? {} }
  } catch {
    return { events: {}, activities: {} }
  }
}

function writeLegacy(map: LegacyMap) {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(map))
}

function unchangedSeedEvent(event: SalesEvent) {
  const seed = SEED.events.find((item) => item.id === event.id)
  if (!seed) return false
  return (
    seed.name === event.name &&
    seed.startDate === event.startDate &&
    seed.endDate === event.endDate &&
    seed.place === event.place &&
    seed.memo === event.memo
  )
}

function toEvent(row: EventRow): SalesEvent {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    place: row.place,
    memo: row.memo,
  }
}

function toActivity(row: ActivityRow, contactIds: string[]): Activity {
  return {
    id: row.id,
    date: row.activity_date,
    type: row.type,
    title: row.title,
    companyId: row.company_id,
    contactIds,
    eventId: row.event_id,
    businessId: row.business_id ?? null,
    purpose: row.purpose,
    status: row.status,
    notes: row.notes,
    opinion: row.opinion ?? '',
    startTime: clock(row.start_time),
    endTime: clock(row.end_time),
    authorId: row.author_id ?? '',
    relatedActivityId: row.related_activity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function client() {
  if (!supabase) throw new Error('일정을 저장하지 못했습니다.')
  return supabase
}

async function currentUserId() {
  const { data, error } = await client().auth.getSession()
  if (error || !data.session?.user.id) throw new Error('일정을 저장하지 못했습니다.')
  return data.session.user.id
}

async function selectActivities(db: SupabaseClient) {
  if (extendedColumns !== false) {
    const full = await db.from('activities').select(ACTIVITY_COLUMNS)
    if (!full.error) {
      extendedColumns = true
      return (full.data ?? []) as ActivityRow[]
    }
    if (!missingColumn(full.error)) throw full.error
    extendedColumns = false
  }
  const basic = await db.from('activities').select(ACTIVITY_COLUMNS_BASIC)
  if (basic.error) throw basic.error
  return (basic.data ?? []) as ActivityRow[]
}

export async function fetchSchedule(): Promise<ScheduleData> {
  const db = client()
  const [eventsResult, activityRows, linksResult] = await Promise.all([
    db.from('events').select('id, name, start_date, end_date, place, memo'),
    selectActivities(db),
    db.from('activity_contacts').select('activity_id, contact_id'),
  ])
  if (eventsResult.error) throw eventsResult.error
  if (linksResult.error && linksResult.error.code !== 'PGRST205') throw linksResult.error
  const links = new Map<string, string[]>()
  for (const row of (linksResult.data ?? []) as LinkRow[]) {
    const list = links.get(row.activity_id) ?? []
    list.push(row.contact_id)
    links.set(row.activity_id, list)
  }
  return {
    events: ((eventsResult.data ?? []) as EventRow[]).map(toEvent),
    activities: activityRows.map((row) => toActivity(row, links.get(row.id) ?? [])),
  }
}

async function insertEvent(event: SalesEvent) {
  const { error } = await client().from('events').insert({
    id: event.id,
    name: event.name,
    start_date: event.startDate,
    end_date: event.endDate || event.startDate,
    place: event.place,
    memo: event.memo,
  })
  if (error) throw error
}

function activityPayload(activity: Activity, authorId: string | null, relatedActivityId: string | null) {
  const payload: Record<string, string | null> = {
    activity_date: activity.date,
    start_time: activity.startTime,
    end_time: activity.endTime,
    type: activity.type,
    title: activity.title,
    company_id: isUuid(activity.companyId) ? activity.companyId : null,
    event_id: isUuid(activity.eventId) ? activity.eventId : null,
    purpose: activity.purpose,
    status: activity.status,
    notes: activity.notes,
    related_activity_id: isUuid(relatedActivityId) ? relatedActivityId : null,
  }
  if (authorId) payload.author_id = authorId
  if (extendedColumns !== false) {
    payload.business_id = isUuid(activity.businessId) ? activity.businessId : null
    payload.opinion = activity.opinion
  }
  return payload
}

async function writeActivity(activity: Activity, authorId: string | null, exists: boolean) {
  const db = client()
  const payload = activityPayload(activity, exists ? null : authorId, activity.relatedActivityId)
  const query = exists
    ? db.from('activities').update(payload).eq('id', activity.id)
    : db.from('activities').insert({ ...payload, id: activity.id, author_id: authorId })
  const { error } = await query
  if (error && extendedColumns !== false && missingColumn(error)) {
    extendedColumns = false
    return writeActivity(activity, authorId, exists)
  }
  if (error) throw error
}

async function replaceContacts(activityId: string, contactIds: string[]) {
  const db = client()
  const next = [...new Set(contactIds.filter(isUuid))]
  const existing = await db.from('activity_contacts').select('contact_id').eq('activity_id', activityId)
  if (existing.error) {
    if (existing.error.code === 'PGRST205') return
    throw existing.error
  }
  const current = new Set(((existing.data ?? []) as { contact_id: string }[]).map((row) => row.contact_id))
  const removing = [...current].filter((id) => !next.includes(id))
  const adding = next.filter((id) => !current.has(id))
  if (removing.length > 0) {
    const { error } = await db.from('activity_contacts').delete().eq('activity_id', activityId).in('contact_id', removing)
    if (error) throw error
  }
  if (adding.length > 0) {
    const { error } = await db.from('activity_contacts').insert(adding.map((contactId) => ({ activity_id: activityId, contact_id: contactId })))
    if (error && error.code !== '23503') throw error
  }
}

export async function pushEvent(event: SalesEvent) {
  const db = client()
  const payload = {
    name: event.name,
    start_date: event.startDate,
    end_date: event.endDate || event.startDate,
    place: event.place,
    memo: event.memo,
  }
  const existing = await db.from('events').select('id').eq('id', event.id).maybeSingle()
  if (existing.error) throw existing.error
  const { error } = existing.data
    ? await db.from('events').update(payload).eq('id', event.id)
    : await db.from('events').insert({ ...payload, id: event.id })
  if (error) throw error
}

export async function pushActivity(activity: Activity, authorId: string) {
  const db = client()
  const existing = await db.from('activities').select('id').eq('id', activity.id).maybeSingle()
  if (existing.error) throw existing.error
  await writeActivity(activity, authorId, Boolean(existing.data))
  await replaceContacts(activity.id, activity.contactIds)
}

export async function removeSharedActivity(id: string) {
  const { data, error } = await client().from('activities').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('관리자 계정에서만 삭제할 수 있습니다.')
}

export async function removeSharedEvent(id: string) {
  const db = client()
  const attendance = await db.from('activities').delete().eq('event_id', id).eq('type', 'event').select('id')
  if (attendance.error) throw attendance.error
  const detached = await db.from('activities').update({ event_id: null }).eq('event_id', id)
  if (detached.error) throw detached.error
  const { data, error } = await db.from('events').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('관리자 계정에서만 삭제할 수 있습니다.')
}

async function importLocal(local: DB, remote: ScheduleData, userId: string): Promise<ScheduleData> {
  const legacy = readLegacy()
  const events = [...remote.events]
  const eventIds = new Set(events.map((event) => event.id))

  for (const event of local.events) {
    if (unchangedSeedEvent(event)) continue
    const mapped = legacy.events[event.id]
    if ((mapped && eventIds.has(mapped)) || eventIds.has(event.id)) continue
    const same = events.find((item) => item.name === event.name && item.startDate === event.startDate)
    if (same) {
      legacy.events[event.id] = same.id
      writeLegacy(legacy)
      continue
    }
    const id = isUuid(event.id) ? event.id : crypto.randomUUID()
    const next = { ...event, id }
    await insertEvent(next)
    legacy.events[event.id] = id
    writeLegacy(legacy)
    events.push(next)
    eventIds.add(id)
  }

  const activities = [...remote.activities]
  const activityIds = new Set(activities.map((activity) => activity.id))
  const pending: Activity[] = []

  for (const activity of local.activities) {
    if (SEED_ACTIVITY_IDS.has(activity.id)) continue
    if (activity.companyId && !isUuid(activity.companyId)) continue
    const mapped = legacy.activities[activity.id]
    if ((mapped && activityIds.has(mapped)) || activityIds.has(activity.id)) continue
    const id = isUuid(activity.id) ? activity.id : crypto.randomUUID()
    const eventId = activity.eventId ? legacy.events[activity.eventId] ?? (isUuid(activity.eventId) ? activity.eventId : null) : null
    const next: Activity = {
      ...activity,
      id,
      eventId: eventId && eventIds.has(eventId) ? eventId : null,
      contactIds: activity.contactIds.filter(isUuid),
      relatedActivityId: null,
    }
    await writeActivity(next, userId, false)
    await replaceContacts(next.id, next.contactIds)
    legacy.activities[activity.id] = id
    writeLegacy(legacy)
    activities.push(next)
    activityIds.add(id)
    pending.push(activity)
  }

  for (const source of pending) {
    const id = legacy.activities[source.id] ?? source.id
    const related = source.relatedActivityId ? legacy.activities[source.relatedActivityId] ?? source.relatedActivityId : null
    if (!isUuid(related) || !activityIds.has(related) || related === id) continue
    const saved = activities.find((item) => item.id === id)
    if (!saved) continue
    saved.relatedActivityId = related
    await writeActivity(saved, null, true)
  }

  return { events, activities }
}

export function loadSharedSchedule(local: DB) {
  if (!loadTask) {
    loadTask = (async () => {
      const remote = await fetchSchedule()
      const userId = await currentUserId()
      return importLocal(local, remote, userId)
    })().catch((error) => {
      loadTask = null
      throw error
    })
  }
  return loadTask
}

export function explainSchedule(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code === '42501') return '관리자 계정에서만 삭제할 수 있습니다.'
  if (error instanceof Error && error.message) {
    if (error.message === '관리자 계정에서만 삭제할 수 있습니다.') return error.message
  }
  return '일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}
