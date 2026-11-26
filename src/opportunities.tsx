import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase'

const LOAD_ERROR = '영업기회를 불러오지 못했습니다.'
const SAVE_ERROR = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const DELETE_ERROR = '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const ADMIN_DELETE = '관리자 계정에서만 삭제할 수 있습니다. 일반 계정은 보관으로 정리할 수 있습니다.'
const LOCAL_KEY = 'sales-crm-opportunities-v1'

export const OPPORTUNITY_STAGES = [
  { id: 'discovery', label: '수요 발굴' },
  { id: 'matching', label: '사업 매칭' },
  { id: 'discussion', label: '고객 협의' },
  { id: 'proposal', label: '제안·신청' },
  { id: 'contract', label: '선정·계약' },
  { id: 'execution', label: '수행·후속' },
] as const

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]['id']

export function opportunityStageLabel(id: OpportunityStage) {
  return OPPORTUNITY_STAGES.find((item) => item.id === id)?.label ?? id
}

export interface Opportunity {
  id: string
  companyId: string
  businessId: string | null
  title: string
  stage: OpportunityStage
  ownerId: string | null
  nextDate: string | null
  amount: string
  memo: string
  archived: boolean
}

export interface OpportunityInput {
  id?: string
  companyId: string
  businessId?: string | null
  title: string
  stage: OpportunityStage
  ownerId?: string | null
  nextDate?: string | null
  amount?: string
  memo?: string
  archived?: boolean
}

interface OpportunityRow {
  id: string
  company_id: string
  business_id: string | null
  title: string
  stage: OpportunityStage
  owner_id: string | null
  next_date: string | null
  amount: string
  memo: string
  archived: boolean
}

const COLUMNS = 'id, company_id, business_id, title, stage, owner_id, next_date, amount, memo, archived'

function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    companyId: row.company_id,
    businessId: row.business_id,
    title: row.title,
    stage: row.stage,
    ownerId: row.owner_id,
    nextDate: row.next_date,
    amount: row.amount ?? '',
    memo: row.memo ?? '',
    archived: row.archived ?? false,
  }
}

function toRow(input: OpportunityInput) {
  return {
    company_id: input.companyId,
    business_id: input.businessId ?? null,
    title: input.title.trim(),
    stage: input.stage,
    owner_id: input.ownerId ?? null,
    next_date: input.nextDate || null,
    amount: (input.amount ?? '').trim(),
    memo: (input.memo ?? '').trim(),
    archived: input.archived ?? false,
  }
}

function readLocal(): Opportunity[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Opportunity[]) : []
  } catch {
    return []
  }
}

interface OpportunityApi {
  remote: boolean
  ready: boolean
  /** 영업기회 테이블(portfolio.sql)이 준비되어 있는지 */
  available: boolean
  error: string
  opportunities: Opportunity[]
  refresh: () => Promise<void>
  save: (input: OpportunityInput) => Promise<string>
  move: (id: string, stage: OpportunityStage) => Promise<void>
  archive: (id: string, archived: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

const OpportunityContext = createContext<OpportunityApi | null>(null)

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `opp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function OpportunityProvider({ children }: { children: ReactNode }) {
  const remote = Boolean(supabase)
  const [items, setItems] = useState<Opportunity[]>(() => (remote ? [] : readLocal()))
  const [ready, setReady] = useState(!remote)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data, error: loadError } = await supabase.from('opportunities').select(COLUMNS)
    if (loadError) {
      // 테이블이 아직 없으면(PGRST205, 42P01) 준비 중 상태로 둡니다.
      const missing = loadError.code === 'PGRST205' || loadError.code === '42P01'
      setAvailable(!missing)
      setError(missing ? '' : LOAD_ERROR)
      setReady(true)
      return
    }
    setAvailable(true)
    setItems(((data ?? []) as OpportunityRow[]).map(toOpportunity))
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

  useEffect(() => {
    if (remote) return
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
    } catch {
      /* 저장 공간을 쓸 수 없는 브라우저 */
    }
  }, [items, remote])

  const replace = useCallback((next: Opportunity) => {
    setItems((current) => (current.some((item) => item.id === next.id) ? current.map((item) => (item.id === next.id ? next : item)) : [...current, next]))
  }, [])

  const save = useCallback(
    async (input: OpportunityInput) => {
      if (!supabase) {
        const existing = input.id ? items.find((item) => item.id === input.id) : undefined
        const next: Opportunity = {
          id: input.id ?? newId(),
          companyId: input.companyId,
          businessId: input.businessId ?? null,
          title: input.title.trim(),
          stage: input.stage,
          ownerId: input.ownerId ?? existing?.ownerId ?? null,
          nextDate: input.nextDate || null,
          amount: (input.amount ?? '').trim(),
          memo: (input.memo ?? '').trim(),
          archived: input.archived ?? existing?.archived ?? false,
        }
        replace(next)
        return next.id
      }
      const query = input.id
        ? supabase.from('opportunities').update(toRow(input)).eq('id', input.id).select(COLUMNS).single()
        : supabase.from('opportunities').insert(toRow(input)).select(COLUMNS).single()
      const { data, error: saveError } = await query
      if (saveError || !data) throw new Error(SAVE_ERROR)
      const saved = toOpportunity(data as OpportunityRow)
      replace(saved)
      return saved.id
    },
    [items, replace],
  )

  const patch = useCallback(
    async (id: string, partial: { stage?: OpportunityStage; archived?: boolean }) => {
      const before = items.find((item) => item.id === id)
      if (!before) return
      replace({ ...before, ...partial })
      if (!supabase) return
      const { error: updateError } = await supabase.from('opportunities').update(partial).eq('id', id)
      if (updateError) {
        replace(before)
        throw new Error(SAVE_ERROR)
      }
    },
    [items, replace],
  )

  const move = useCallback((id: string, stage: OpportunityStage) => patch(id, { stage }), [patch])
  const archive = useCallback((id: string, archived: boolean) => patch(id, { archived }), [patch])

  const remove = useCallback(async (id: string) => {
    if (supabase) {
      const { data, error: deleteError } = await supabase.from('opportunities').delete().eq('id', id).select('id')
      if (deleteError) throw new Error(DELETE_ERROR)
      if (!data?.length) throw new Error(ADMIN_DELETE)
    }
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo<OpportunityApi>(
    () => ({ remote, ready, available, error, opportunities: items, refresh, save, move, archive, remove }),
    [remote, ready, available, error, items, refresh, save, move, archive, remove],
  )

  return <OpportunityContext.Provider value={value}>{children}</OpportunityContext.Provider>
}

export function useOpportunities() {
  const value = useContext(OpportunityContext)
  if (!value) throw new Error('useOpportunities must be used within OpportunityProvider')
  return value
}
