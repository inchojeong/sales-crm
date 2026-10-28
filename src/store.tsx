import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isEventAttendance } from './attendance'
import { useAuth } from './auth'
import { supabase } from './lib/supabase'
import {
  explainSchedule,
  fetchSchedule,
  loadSharedSchedule,
  pushActivity,
  pushEvent,
  removeSharedActivity,
  removeSharedEvent,
} from './scheduleSync'
import { SEED } from './seed'
import { CURRENT_USER } from './session'
import type {
  Activity,
  ActivityInput,
  Company,
  CompanyInput,
  Contact,
  ContactInput,
  DB,
  EventInput,
  SalesEvent,
} from './types'

const STORAGE_KEY = 'sales-crm-v1'

interface Persisted extends DB {
  version: 2
}

interface CrmApi {
  db: DB
  currentUser: typeof CURRENT_USER
  companyById: Map<string, Company>
  contactById: Map<string, Contact>
  eventById: Map<string, SalesEvent>
  saveActivity: (input: ActivityInput) => void
  saveCompany: (input: CompanyInput) => string
  saveContact: (input: ContactInput) => string
  saveEvent: (input: EventInput) => string
  deleteActivity: (id: string) => void
  deleteEvent: (id: string) => void
  releaseContact: (contactId: string) => void
  releaseCompany: (companyId: string, contactIds: string[]) => void
  resetDemo: () => void
  scheduleReady: boolean
  scheduleError: string
}

const CrmContext = createContext<CrmApi | null>(null)

function load(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(SEED)
    const parsed = JSON.parse(raw) as Persisted
    if (
      parsed.version !== 2 ||
      !Array.isArray(parsed.activities) ||
      !Array.isArray(parsed.companies) ||
      !Array.isArray(parsed.contacts) ||
      !Array.isArray(parsed.events)
    ) {
      return structuredClone(SEED)
    }
    return {
      companies: parsed.companies,
      contacts: parsed.contacts,
      events: parsed.events,
      activities: parsed.activities.map((activity) => ({
        ...activity,
        businessId: activity.businessId ?? null,
        opinion: activity.opinion ?? '',
      })),
    }
  } catch {
    return structuredClone(SEED)
  }
}

function applyActivity(prev: DB, input: ActivityInput, authorId: string): { db: DB; activity: Activity } {
  const now = new Date().toISOString()
  let events = prev.events
  let eventId = input.eventId
  const newName = input.newEventName?.trim() ?? ''
  if (newName) {
    const created: SalesEvent = {
      id: crypto.randomUUID(),
      name: newName,
      startDate: input.date,
      endDate: input.date,
      place: '',
      memo: '',
    }
    events = [...events, created]
    eventId = created.id
  }
  const companyId = input.companyId
  const ownerByContact = new Map(prev.contacts.map((contact) => [contact.id, contact.companyId]))
  const contactIds = companyId
    ? [...new Set(input.contactIds)].filter((id) => {
        const owner = ownerByContact.get(id)
        return owner === undefined || owner === companyId
      })
    : []
  const existing = input.id ? prev.activities.find((item) => item.id === input.id) : undefined
  const next: Activity = {
    id: input.id ?? crypto.randomUUID(),
    date: input.date,
    type: input.type,
    title: input.title.trim(),
    companyId,
    contactIds,
    eventId,
    businessId: input.businessId ?? null,
    purpose: input.purpose,
    status: input.status,
    notes: input.notes.trim(),
    opinion: input.opinion?.trim() ?? '',
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    authorId: existing?.authorId || authorId,
    relatedActivityId: input.relatedActivityId && input.relatedActivityId !== input.id ? input.relatedActivityId : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const exists = prev.activities.some((item) => item.id === next.id)
  return {
    activity: next,
    db: {
      ...prev,
      events,
      activities: exists ? prev.activities.map((item) => (item.id === next.id ? next : item)) : [...prev.activities, next],
    },
  }
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const currentUser = profile
    ? { id: profile.id, name: profile.display_name, email: profile.email }
    : CURRENT_USER
  const localSnapshot = useRef<DB | null>(null)
  if (!localSnapshot.current) localSnapshot.current = load()
  const [scheduleReady, setScheduleReady] = useState(!supabase)
  const [scheduleError, setScheduleError] = useState('')
  const [db, setDb] = useState<DB>(() => {
    const loaded = localSnapshot.current ?? load()
    if (!supabase) return loaded
    return { ...loaded, events: [], activities: [] }
  })

  useEffect(() => {
    if (supabase && !scheduleReady) return
    const payload: Persisted = { version: 2, ...db }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [db, scheduleReady])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const snapshot = localSnapshot.current ?? load()
    void loadSharedSchedule(snapshot)
      .then((shared) => {
        if (!active) return
        setDb((prev) => ({ ...prev, events: shared.events, activities: shared.activities }))
        setScheduleError('')
        setScheduleReady(true)
      })
      .catch(() => {
        if (!active) return
        setDb((prev) => ({ ...prev, events: snapshot.events, activities: snapshot.activities }))
        setScheduleError('일정을 불러오지 못했습니다.')
        setScheduleReady(true)
      })

    const onFocus = () => {
      void fetchSchedule()
        .then((shared) => {
          setDb((prev) => ({ ...prev, events: shared.events, activities: shared.activities }))
          setScheduleError('')
        })
        .catch(() => {
          setScheduleError('일정을 불러오지 못했습니다.')
        })
    }
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const companyById = useMemo(() => new Map(db.companies.map((company) => [company.id, company])), [db.companies])
  const contactById = useMemo(() => new Map(db.contacts.map((contact) => [contact.id, contact])), [db.contacts])
  const eventById = useMemo(() => new Map(db.events.map((event) => [event.id, event])), [db.events])

  const saveActivity = useCallback(
    (input: ActivityInput) => {
      const box: { previous: DB | null; applied: { db: DB; activity: Activity } | null } = {
        previous: null,
        applied: null,
      }
      setDb((prev) => {
        const result = applyActivity(prev, input, currentUser.id)
        box.previous = prev
        box.applied = result
        return result.db
      })
      if (!supabase || !box.previous || !box.applied) return
      const created = box.applied.db.events.filter((event) => !box.previous?.events.some((item) => item.id === event.id))
      const activity = box.applied.activity
      void (async () => {
        for (const event of created) await pushEvent(event)
        await pushActivity(activity, currentUser.id)
        setScheduleError('')
      })().catch((error: unknown) => setScheduleError(explainSchedule(error)))
    },
    [currentUser.id],
  )

  const saveCompany = useCallback((input: CompanyInput) => {
    const id = input.id ?? crypto.randomUUID()
    const next: Company = {
      id,
      name: input.name.trim(),
      industry: input.industry.trim(),
      website: input.website.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      summary: input.summary.trim(),
    }
    setDb((prev) => ({
      ...prev,
      companies: prev.companies.some((company) => company.id === id)
        ? prev.companies.map((company) => (company.id === id ? next : company))
        : [...prev.companies, next],
    }))
    return id
  }, [])

  const saveContact = useCallback((input: ContactInput) => {
    const id = input.id ?? crypto.randomUUID()
    const next: Contact = {
      id,
      companyId: input.companyId,
      name: input.name.trim(),
      department: input.department.trim(),
      position: input.position.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      memo: input.memo.trim(),
    }
    setDb((prev) => ({
      ...prev,
      contacts: prev.contacts.some((contact) => contact.id === id)
        ? prev.contacts.map((contact) => (contact.id === id ? next : contact))
        : [...prev.contacts, next],
    }))
    return id
  }, [])

  const saveEvent = useCallback((input: EventInput) => {
    const id = input.id ?? crypto.randomUUID()
    const next: SalesEvent = {
      id,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate || input.startDate,
      place: input.place.trim(),
      memo: input.memo.trim(),
    }
    setDb((prev) => ({
      ...prev,
      events: prev.events.some((event) => event.id === id)
        ? prev.events.map((event) => (event.id === id ? next : event))
        : [...prev.events, next],
    }))
    if (supabase) {
      void pushEvent(next)
        .then(() => setScheduleError(''))
        .catch((error: unknown) => setScheduleError(explainSchedule(error)))
    }
    return id
  }, [])

  const deleteActivity = useCallback((id: string) => {
    const now = new Date().toISOString()
    setDb((prev) => ({
      ...prev,
      activities: prev.activities
        .filter((activity) => activity.id !== id)
        .map((activity) =>
          activity.relatedActivityId === id ? { ...activity, relatedActivityId: null, updatedAt: now } : activity,
        ),
    }))
    if (supabase) {
      void removeSharedActivity(id)
        .then(() => setScheduleError(''))
        .catch((error: unknown) => setScheduleError(explainSchedule(error)))
    }
  }, [])

  const deleteEvent = useCallback((id: string) => {
    const now = new Date().toISOString()
    setDb((prev) => ({
      ...prev,
      events: prev.events.filter((event) => event.id !== id),
      activities: prev.activities.flatMap((activity) => {
        if (activity.eventId !== id) return [activity]
        if (isEventAttendance(activity)) return []
        return [{ ...activity, eventId: null, updatedAt: now }]
      }),
    }))
    if (supabase) {
      void removeSharedEvent(id)
        .then(() => setScheduleError(''))
        .catch((error: unknown) => setScheduleError(explainSchedule(error)))
    }
  }, [])

  const releaseContact = useCallback(
    (contactId: string) => {
      const now = new Date().toISOString()
      const changed: Activity[] = []
      const removed: string[] = []
      setDb((prev) => {
        const activities = prev.activities.flatMap((activity) => {
          if (!activity.contactIds.includes(contactId)) return [activity]
          const contactIds = activity.contactIds.filter((id) => id !== contactId)
          if (isEventAttendance(activity) && contactIds.length === 0) {
            removed.push(activity.id)
            return []
          }
          const next = { ...activity, contactIds, updatedAt: now }
          changed.push(next)
          return [next]
        })
        return { ...prev, contacts: prev.contacts.filter((contact) => contact.id !== contactId), activities }
      })
      if (!supabase) return
      void (async () => {
        for (const id of removed) await removeSharedActivity(id)
        for (const activity of changed) await pushActivity(activity, currentUser.id)
      })().catch((error: unknown) => setScheduleError(explainSchedule(error)))
    },
    [currentUser.id],
  )

  const releaseCompany = useCallback(
    (companyId: string, contactIds: string[]) => {
      const dropping = new Set(contactIds)
      const now = new Date().toISOString()
      const changed: Activity[] = []
      const removed: string[] = []
      setDb((prev) => ({
        ...prev,
        companies: prev.companies.filter((company) => company.id !== companyId),
        contacts: prev.contacts.filter((contact) => contact.companyId !== companyId && !dropping.has(contact.id)),
        activities: prev.activities.flatMap((activity) => {
          const nextContacts = activity.contactIds.filter((id) => !dropping.has(id))
          const linked = activity.companyId === companyId
          const touched = linked || nextContacts.length !== activity.contactIds.length
          if (!touched) return [activity]
          if (isEventAttendance(activity) && nextContacts.length === 0) {
            removed.push(activity.id)
            return []
          }
          const next = { ...activity, companyId: linked ? null : activity.companyId, contactIds: nextContacts, updatedAt: now }
          changed.push(next)
          return [next]
        }),
      }))
      if (!supabase) return
      void (async () => {
        for (const id of removed) await removeSharedActivity(id)
        for (const activity of changed) await pushActivity(activity, currentUser.id)
      })().catch((error: unknown) => setScheduleError(explainSchedule(error)))
    },
    [currentUser.id],
  )

  const resetDemo = useCallback(() => {
    setDb(structuredClone(SEED))
  }, [])

  const value = useMemo<CrmApi>(
    () => ({
      db,
      currentUser,
      companyById,
      contactById,
      eventById,
      saveActivity,
      saveCompany,
      saveContact,
      saveEvent,
      deleteActivity,
      deleteEvent,
      releaseContact,
      releaseCompany,
      resetDemo,
      scheduleReady,
      scheduleError,
    }),
    [db, currentUser, companyById, contactById, eventById, saveActivity, saveCompany, saveContact, saveEvent, deleteActivity, deleteEvent, releaseContact, releaseCompany, resetDemo, scheduleReady, scheduleError],
  )

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const value = useContext(CrmContext)
  if (!value) throw new Error('useCrm must be used within CrmProvider')
  return value
}
