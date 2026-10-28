import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase'
import { importProvidedBusinesses } from './providedBusinesses'

let notifiedDirectory = false

const LOAD_ERROR = '사업 정보를 불러오지 못했습니다.'
const SAVE_ERROR = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'

export const BUSINESS_TYPES = [
  { id: 'government', label: '정부지원사업' },
  { id: 'b2b', label: 'B2B' },
  { id: 'b2g', label: 'B2G' },
  { id: 'rnd', label: 'R&D' },
  { id: 'other', label: '기타' },
] as const

export const BUSINESS_STATUSES = [
  { id: 'preparing', label: '준비' },
  { id: 'active', label: '진행' },
  { id: 'paused', label: '보류' },
  { id: 'done', label: '완료' },
  { id: 'stopped', label: '중단' },
] as const

export const MILESTONE_KINDS = [
  { id: 'schedule', label: '일정' },
  { id: 'milestone', label: '마일스톤' },
] as const

export const MILESTONE_STATUSES = [
  { id: 'planned', label: '예정' },
  { id: 'done', label: '완료' },
] as const

export type BusinessType = (typeof BUSINESS_TYPES)[number]['id']
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]['id']
export type MilestoneKind = (typeof MILESTONE_KINDS)[number]['id']
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]['id']

export interface BusinessRecord {
  id: string
  name: string
  overview: string
  type: BusinessType
  status: BusinessStatus
  startDate: string
  endDate: string
  companyId: string
  targetContactIds: string[]
  stakeholderIds: string[]
}

export interface BusinessInput {
  id?: string
  name: string
  overview: string
  type: BusinessType
  status: BusinessStatus
  startDate: string
  endDate: string
  companyId: string
  targetContactIds: string[]
  stakeholderIds: string[]
}

export interface Milestone {
  id: string
  businessId: string
  title: string
  date: string
  kind: MilestoneKind
  memo: string
  status: MilestoneStatus
}

export interface MilestoneInput {
  id?: string
  businessId: string
  title: string
  date: string
  kind: MilestoneKind
  memo: string
  status: MilestoneStatus
}

interface BusinessRow {
  id: string
  name: string
  overview: string
  type: BusinessType
  status: BusinessStatus
  start_date: string
  end_date: string
  company_id: string
}

interface LinkRow {
  business_id: string
  contact_id: string
}

interface MilestoneRow {
  id: string
  business_id: string
  title: string
  milestone_date: string
  kind: MilestoneKind
  memo: string
  status: MilestoneStatus
}

interface BusinessApi {
  remote: boolean
  ready: boolean
  error: string
  businesses: BusinessRecord[]
  milestones: Milestone[]
  refresh: () => Promise<void>
  saveBusiness: (input: BusinessInput) => Promise<string>
  saveMilestone: (input: MilestoneInput) => Promise<string>
  deleteMilestone: (id: string) => Promise<void>
}

const BusinessContext = createContext<BusinessApi | null>(null)

const BUSINESS_COLUMNS = 'id, name, overview, type, status, start_date, end_date, company_id'
const MILESTONE_COLUMNS = 'id, business_id, title, milestone_date, kind, memo, status'

function labelFrom<T extends string>(options: readonly { id: T; label: string }[], id: T) {
  return options.find((item) => item.id === id)?.label ?? id
}

export function businessTypeLabel(id: BusinessType) {
  return labelFrom(BUSINESS_TYPES, id)
}

export function businessStatusLabel(id: BusinessStatus) {
  return labelFrom(BUSINESS_STATUSES, id)
}

export function milestoneKindLabel(id: MilestoneKind) {
  return labelFrom(MILESTONE_KINDS, id)
}

export function milestoneStatusLabel(id: MilestoneStatus) {
  return labelFrom(MILESTONE_STATUSES, id)
}

function groupLinks(rows: LinkRow[]) {
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    const current = grouped.get(row.business_id) ?? []
    current.push(row.contact_id)
    grouped.set(row.business_id, current)
  }
  return grouped
}

function toBusiness(row: BusinessRow, targets: Map<string, string[]>, stakeholders: Map<string, string[]>): BusinessRecord {
  return {
    id: row.id,
    name: row.name,
    overview: row.overview,
    type: row.type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    companyId: row.company_id,
    targetContactIds: targets.get(row.id) ?? [],
    stakeholderIds: stakeholders.get(row.id) ?? [],
  }
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    businessId: row.business_id,
    title: row.title,
    date: row.milestone_date,
    kind: row.kind,
    memo: row.memo,
    status: row.status,
  }
}

function replaceById<T extends { id: string }>(items: T[], next: T) {
  return items.some((item) => item.id === next.id) ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next]
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const remote = Boolean(supabase)
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [ready, setReady] = useState(!remote)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const [businessResult, targetResult, stakeholderResult, milestoneResult] = await Promise.all([
      supabase.from('businesses').select(BUSINESS_COLUMNS),
      supabase.from('business_targets').select('business_id, contact_id'),
      supabase.from('business_stakeholders').select('business_id, contact_id'),
      supabase.from('business_milestones').select(MILESTONE_COLUMNS),
    ])
    if (businessResult.error || targetResult.error || stakeholderResult.error || milestoneResult.error) {
      setError(LOAD_ERROR)
      setReady(true)
      return
    }
    let businessRows = (businessResult.data ?? []) as BusinessRow[]
    try {
      const added = await importProvidedBusinesses(supabase)
      if (added) {
        const again = await supabase.from('businesses').select(BUSINESS_COLUMNS)
        if (!again.error) businessRows = (again.data ?? []) as BusinessRow[]
        if (!notifiedDirectory) {
          notifiedDirectory = true
          window.dispatchEvent(new Event('focus'))
        }
      }
    } catch {
      /* 화면의 기존 사업 조회는 유지하고, 다음 조회에서 등록을 다시 시도합니다. */
    }
    const targets = groupLinks((targetResult.data ?? []) as LinkRow[])
    const stakeholders = groupLinks((stakeholderResult.data ?? []) as LinkRow[])
    setBusinesses(businessRows.map((row) => toBusiness(row, targets, stakeholders)))
    setMilestones(((milestoneResult.data ?? []) as MilestoneRow[]).map(toMilestone))
    setError('')
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const syncLinks = useCallback(async (table: 'business_targets' | 'business_stakeholders', businessId: string, nextIds: string[]) => {
    if (!supabase) throw new Error(SAVE_ERROR)
    const { data, error: readError } = await supabase.from(table).select('contact_id').eq('business_id', businessId)
    if (readError) throw new Error(SAVE_ERROR)
    const current = new Set(((data ?? []) as { contact_id: string }[]).map((row) => row.contact_id))
    const next = new Set(nextIds)
    const adding = [...next].filter((id) => !current.has(id))
    const removing = [...current].filter((id) => !next.has(id))
    if (adding.length > 0) {
      const { error: insertError } = await supabase.from(table).insert(adding.map((contactId) => ({ business_id: businessId, contact_id: contactId })))
      if (insertError) throw new Error(SAVE_ERROR)
    }
    if (removing.length > 0) {
      const { error: deleteError } = await supabase.from(table).delete().eq('business_id', businessId).in('contact_id', removing)
      if (deleteError) throw new Error(SAVE_ERROR)
    }
  }, [])

  const saveBusiness = useCallback(
    async (input: BusinessInput) => {
      if (!supabase) throw new Error(SAVE_ERROR)
      const payload = {
        name: input.name.trim(),
        overview: input.overview.trim(),
        type: input.type,
        status: input.status,
        start_date: input.startDate,
        end_date: input.endDate,
        company_id: input.companyId,
      }
      const query = input.id
        ? supabase.from('businesses').update(payload).eq('id', input.id).select(BUSINESS_COLUMNS).single()
        : supabase.from('businesses').insert(payload).select(BUSINESS_COLUMNS).single()
      const { data, error: saveError } = await query
      if (saveError || !data) throw new Error(SAVE_ERROR)
      const row = data as BusinessRow
      try {
        await syncLinks('business_targets', row.id, input.targetContactIds)
        await syncLinks('business_stakeholders', row.id, input.stakeholderIds)
      } catch (linkError) {
        await refresh()
        throw linkError
      }
      const saved = toBusiness(row, new Map([[row.id, input.targetContactIds]]), new Map([[row.id, input.stakeholderIds]]))
      setBusinesses((current) => replaceById(current, saved))
      return row.id
    },
    [refresh, syncLinks],
  )

  const saveMilestone = useCallback(async (input: MilestoneInput) => {
    if (!supabase) throw new Error(SAVE_ERROR)
    const payload = {
      business_id: input.businessId,
      title: input.title.trim(),
      milestone_date: input.date,
      kind: input.kind,
      memo: input.memo.trim(),
      status: input.status,
    }
    const query = input.id
      ? supabase.from('business_milestones').update(payload).eq('id', input.id).select(MILESTONE_COLUMNS).single()
      : supabase.from('business_milestones').insert(payload).select(MILESTONE_COLUMNS).single()
    const { data, error: saveError } = await query
    if (saveError || !data) throw new Error(SAVE_ERROR)
    const milestone = toMilestone(data as MilestoneRow)
    setMilestones((current) => replaceById(current, milestone))
    return milestone.id
  }, [])

  const deleteMilestone = useCallback(async (id: string) => {
    if (!supabase) throw new Error(SAVE_ERROR)
    const { error: deleteError } = await supabase.from('business_milestones').delete().eq('id', id)
    if (deleteError) throw new Error(SAVE_ERROR)
    setMilestones((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo<BusinessApi>(
    () => ({ remote, ready, error, businesses, milestones, refresh, saveBusiness, saveMilestone, deleteMilestone }),
    [remote, ready, error, businesses, milestones, refresh, saveBusiness, saveMilestone, deleteMilestone],
  )

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness() {
  const value = useContext(BusinessContext)
  if (!value) throw new Error('useBusiness must be used within BusinessProvider')
  return value
}
