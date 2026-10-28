import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  resetDemo: () => void
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
      activities: parsed.activities,
    }
  } catch {
    return structuredClone(SEED)
  }
}

function applyActivity(prev: DB, input: ActivityInput): DB {
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
  const contactIds = companyId
    ? input.contactIds.filter((id) => prev.contacts.some((contact) => contact.id === id && contact.companyId === companyId))
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
    purpose: input.purpose,
    status: input.status,
    notes: input.notes.trim(),
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    authorId: existing?.authorId ?? CURRENT_USER.id,
    relatedActivityId: input.relatedActivityId && input.relatedActivityId !== input.id ? input.relatedActivityId : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const exists = prev.activities.some((item) => item.id === next.id)
  return {
    ...prev,
    events,
    activities: exists ? prev.activities.map((item) => (item.id === next.id ? next : item)) : [...prev.activities, next],
  }
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => load())

  useEffect(() => {
    const payload: Persisted = { version: 2, ...db }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [db])

  const companyById = useMemo(() => new Map(db.companies.map((company) => [company.id, company])), [db.companies])
  const contactById = useMemo(() => new Map(db.contacts.map((contact) => [contact.id, contact])), [db.contacts])
  const eventById = useMemo(() => new Map(db.events.map((event) => [event.id, event])), [db.events])

  const saveActivity = useCallback((input: ActivityInput) => {
    setDb((prev) => applyActivity(prev, input))
  }, [])

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
  }, [])

  const resetDemo = useCallback(() => {
    setDb(structuredClone(SEED))
  }, [])

  const value = useMemo<CrmApi>(
    () => ({
      db,
      currentUser: CURRENT_USER,
      companyById,
      contactById,
      eventById,
      saveActivity,
      saveCompany,
      saveContact,
      saveEvent,
      deleteActivity,
      resetDemo,
    }),
    [db, companyById, contactById, eventById, saveActivity, saveCompany, saveContact, saveEvent, deleteActivity, resetDemo],
  )

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const value = useContext(CrmContext)
  if (!value) throw new Error('useCrm must be used within CrmProvider')
  return value
}
