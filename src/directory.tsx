import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase'
import type { Company, CompanyInput, Contact, ContactInput } from './types'

const LOAD_ERROR = '고객사 정보를 불러오지 못했습니다.'
const SAVE_ERROR = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const DELETE_ERROR = '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const ADMIN_DELETE = '관리자 계정에서만 삭제할 수 있습니다.'

const COMPANY_COLUMNS = 'id, name, industry, website, phone, address, summary'
const CONTACT_COLUMNS = 'id, company_id, name, department, position, email, phone, memo'

interface CompanyRow {
  id: string
  name: string
  industry: string
  website: string
  phone: string
  address: string
  summary: string
}

interface ContactRow {
  id: string
  company_id: string
  name: string
  department: string
  position: string
  email: string
  phone: string
  memo: string
}

interface DirectoryApi {
  remote: boolean
  ready: boolean
  error: string
  companies: Company[]
  contacts: Contact[]
  companyById: Map<string, Company>
  refresh: () => Promise<void>
  saveCompany: (input: CompanyInput) => Promise<string>
  saveContact: (input: ContactInput) => Promise<string>
  deleteCompany: (id: string) => Promise<void>
  deleteContact: (id: string) => Promise<void>
}

const DirectoryContext = createContext<DirectoryApi | null>(null)

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    website: row.website,
    phone: row.phone,
    address: row.address,
    summary: row.summary,
  }
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    department: row.department,
    position: row.position,
    email: row.email,
    phone: row.phone,
    memo: row.memo,
  }
}

function companyPayload(input: CompanyInput) {
  return {
    name: input.name.trim(),
    industry: input.industry.trim(),
    website: input.website.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    summary: input.summary.trim(),
  }
}

function explainDelete(error: { code?: string }) {
  if (error.code === '23503') return new Error('연결된 기록이 남아 있어 삭제할 수 없습니다.')
  if (error.code === '42501') return new Error(ADMIN_DELETE)
  return new Error(DELETE_ERROR)
}

async function clearContactLinks(id: string) {
  if (!supabase) return
  for (const table of ['business_targets', 'business_stakeholders', 'activity_contacts'] as const) {
    const { error } = await supabase.from(table).delete().eq('contact_id', id)
    if (error && error.code !== 'PGRST205') throw explainDelete(error)
  }
}

function contactPayload(input: ContactInput) {
  return {
    company_id: input.companyId,
    name: input.name.trim(),
    department: input.department.trim(),
    position: input.position.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    memo: input.memo.trim(),
  }
}

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const remote = Boolean(supabase)
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [ready, setReady] = useState(!remote)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const [companyResult, contactResult] = await Promise.all([
      supabase.from('companies').select(COMPANY_COLUMNS),
      supabase.from('contacts').select(CONTACT_COLUMNS),
    ])
    if (companyResult.error || contactResult.error) {
      setError(LOAD_ERROR)
      setReady(true)
      return
    }
    setCompanies((companyResult.data as CompanyRow[]).map(toCompany))
    setContacts((contactResult.data as ContactRow[]).map(toContact))
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

  const saveCompany = useCallback(async (input: CompanyInput) => {
    if (!supabase) throw new Error(SAVE_ERROR)
    const payload = companyPayload(input)
    const query = input.id
      ? supabase.from('companies').update(payload).eq('id', input.id).select(COMPANY_COLUMNS).single()
      : supabase.from('companies').insert(payload).select(COMPANY_COLUMNS).single()
    const { data, error: saveError } = await query
    if (saveError || !data) throw new Error(SAVE_ERROR)
    const company = toCompany(data as CompanyRow)
    setCompanies((current) => {
      const exists = current.some((item) => item.id === company.id)
      return exists ? current.map((item) => (item.id === company.id ? company : item)) : [...current, company]
    })
    return company.id
  }, [])

  const saveContact = useCallback(async (input: ContactInput) => {
    if (!supabase) throw new Error(SAVE_ERROR)
    const payload = contactPayload(input)
    const query = input.id
      ? supabase.from('contacts').update(payload).eq('id', input.id).select(CONTACT_COLUMNS).single()
      : supabase.from('contacts').insert(payload).select(CONTACT_COLUMNS).single()
    const { data, error: saveError } = await query
    if (saveError || !data) throw new Error(SAVE_ERROR)
    const contact = toContact(data as ContactRow)
    setContacts((current) => {
      const exists = current.some((item) => item.id === contact.id)
      return exists ? current.map((item) => (item.id === contact.id ? contact : item)) : [...current, contact]
    })
    return contact.id
  }, [])

  const deleteContact = useCallback(async (id: string) => {
    if (!supabase) throw new Error(DELETE_ERROR)
    await clearContactLinks(id)
    const { data, error: deleteError } = await supabase.from('contacts').delete().eq('id', id).select('id')
    if (deleteError) throw explainDelete(deleteError)
    if (!data?.length) throw new Error(ADMIN_DELETE)
    setContacts((current) => current.filter((item) => item.id !== id))
  }, [])

  const deleteCompany = useCallback(async (id: string) => {
    if (!supabase) throw new Error(DELETE_ERROR)
    const { data: linked, error: linkedError } = await supabase.from('businesses').select('name').eq('company_id', id)
    if (linkedError) throw new Error(DELETE_ERROR)
    const names = (linked ?? []).map((row) => row.name).filter(Boolean)
    if (names.length > 0) throw new Error(`연결된 사업이 있어 삭제할 수 없습니다. ${names.join(', ')}`)
    const { data: people, error: peopleError } = await supabase.from('contacts').select('id').eq('company_id', id)
    if (peopleError) throw new Error(DELETE_ERROR)
    const removed: string[] = []
    try {
      for (const person of people ?? []) {
        await clearContactLinks(person.id)
        const { data, error: contactError } = await supabase.from('contacts').delete().eq('id', person.id).select('id')
        if (contactError) throw explainDelete(contactError)
        if (!data?.length) throw new Error(ADMIN_DELETE)
        removed.push(person.id)
      }
      const { data, error: companyError } = await supabase.from('companies').delete().eq('id', id).select('id')
      if (companyError) throw explainDelete(companyError)
      if (!data?.length) throw new Error(ADMIN_DELETE)
    } catch (error) {
      if (removed.length > 0) setContacts((current) => current.filter((item) => !removed.includes(item.id)))
      throw error
    }
    setContacts((current) => current.filter((item) => item.companyId !== id))
    setCompanies((current) => current.filter((item) => item.id !== id))
  }, [])

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies])

  const value = useMemo<DirectoryApi>(
    () => ({ remote, ready, error, companies, contacts, companyById, refresh, saveCompany, saveContact, deleteCompany, deleteContact }),
    [remote, ready, error, companies, contacts, companyById, refresh, saveCompany, saveContact, deleteCompany, deleteContact],
  )

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>
}

export function useDirectory() {
  const value = useContext(DirectoryContext)
  if (!value) throw new Error('useDirectory must be used within DirectoryProvider')
  return value
}
