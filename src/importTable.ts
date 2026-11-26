import { normalizeName } from './quickCapture'
import type { Company, CompanyInput, Contact, ContactInput } from './types'

export type ImportKind = 'companies' | 'contacts'

export const MAX_IMPORT_ROWS = 500

export type CompanyField = 'name' | 'industry' | 'website' | 'phone' | 'address' | 'summary'
export type ContactField = 'companyName' | 'name' | 'department' | 'position' | 'email' | 'phone' | 'memo'

export const COMPANY_FIELDS: { id: CompanyField; label: string }[] = [
  { id: 'name', label: '고객사명' },
  { id: 'industry', label: '업종' },
  { id: 'website', label: '홈페이지' },
  { id: 'phone', label: '대표 연락처' },
  { id: 'address', label: '주소' },
  { id: 'summary', label: '소개' },
]

export const CONTACT_FIELDS: { id: ContactField; label: string }[] = [
  { id: 'companyName', label: '고객사' },
  { id: 'name', label: '이름' },
  { id: 'department', label: '부서' },
  { id: 'position', label: '직급' },
  { id: 'email', label: '이메일' },
  { id: 'phone', label: '연락처' },
  { id: 'memo', label: '메모' },
]

const COMPANY_HEADERS: Record<string, CompanyField> = {
  고객사: 'name',
  고객사명: 'name',
  회사: 'name',
  회사명: 'name',
  기업: 'name',
  기업명: 'name',
  업체: 'name',
  업체명: 'name',
  상호: 'name',
  업종: 'industry',
  산업: 'industry',
  분야: 'industry',
  홈페이지: 'website',
  웹사이트: 'website',
  사이트: 'website',
  url: 'website',
  대표연락처: 'phone',
  대표전화: 'phone',
  전화: 'phone',
  전화번호: 'phone',
  연락처: 'phone',
  주소: 'address',
  소개: 'summary',
  설명: 'summary',
  메모: 'summary',
  비고: 'summary',
}

const CONTACT_HEADERS: Record<string, ContactField> = {
  고객사: 'companyName',
  고객사명: 'companyName',
  회사: 'companyName',
  회사명: 'companyName',
  기업: 'companyName',
  기업명: 'companyName',
  업체: 'companyName',
  업체명: 'companyName',
  소속: 'companyName',
  이름: 'name',
  성명: 'name',
  담당자: 'name',
  담당자명: 'name',
  name: 'name',
  부서: 'department',
  팀: 'department',
  부서명: 'department',
  직급: 'position',
  직책: 'position',
  직위: 'position',
  이메일: 'email',
  메일: 'email',
  email: 'email',
  연락처: 'phone',
  전화: 'phone',
  전화번호: 'phone',
  휴대폰: 'phone',
  핸드폰: 'phone',
  mobile: 'phone',
  tel: 'phone',
  phone: 'phone',
  메모: 'memo',
  비고: 'memo',
}

const DEFAULT_COMPANY_ORDER: CompanyField[] = ['name', 'industry', 'website', 'phone', 'address', 'summary']
const DEFAULT_CONTACT_ORDER: ContactField[] = ['companyName', 'name', 'department', 'position', 'email', 'phone', 'memo']

export function splitRows(text: string): string[][] {
  const delimiter = text.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const flush = () => {
    row.push(cell.trim())
    cell = ''
  }
  const endRow = () => {
    flush()
    if (row.some((value) => value !== '')) rows.push(row)
    row = []
  }
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) flush()
    else if (char === '\n') endRow()
    else if (char !== '\r') cell += char
  }
  endRow()
  return rows
}

function headerKey(value: string) {
  return value.normalize('NFKC').replace(/[\s*:：]/g, '').toLowerCase()
}

export interface ParsedTable<F extends string> {
  rows: Record<F, string>[]
  hasHeader: boolean
  columns: (F | null)[]
  truncated: boolean
}

function parseWith<F extends string>(
  text: string,
  headers: Record<string, F>,
  order: F[],
  fields: readonly { id: F }[],
  needed: F,
): ParsedTable<F> {
  const table = splitRows(text)
  if (table.length === 0) return { rows: [], hasHeader: false, columns: [], truncated: false }
  const first = table[0].map((value) => headers[headerKey(value)] ?? null)
  const hasHeader = first.includes(needed)
  const columns: (F | null)[] = hasHeader
    ? first.map((field, index) => (field && first.indexOf(field) === index ? field : null))
    : table[0].map((_, index) => order[index] ?? null)
  const body = hasHeader ? table.slice(1) : table
  const truncated = body.length > MAX_IMPORT_ROWS
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((cells) => {
    const record = Object.fromEntries(fields.map((field) => [field.id, ''])) as Record<F, string>
    columns.forEach((field, index) => {
      if (field) record[field] = (cells[index] ?? '').trim()
    })
    return record
  })
  return { rows, hasHeader, columns, truncated }
}

export function parseCompanyTable(text: string) {
  return parseWith<CompanyField>(text, COMPANY_HEADERS, DEFAULT_COMPANY_ORDER, COMPANY_FIELDS, 'name')
}

export function parseContactTable(text: string) {
  return parseWith<ContactField>(text, CONTACT_HEADERS, DEFAULT_CONTACT_ORDER, CONTACT_FIELDS, 'name')
}

function aliasesOf(name: string) {
  const base = normalizeName(name)
  const set = new Set<string>([base])
  const stripped = base.replace(/\([^)]*\)/g, '')
  if (stripped) set.add(stripped)
  for (const inner of base.matchAll(/\(([^)]*)\)/g)) if (inner[1]) set.add(inner[1])
  return set
}

export function sameCompanyName(a: string, b: string) {
  const left = aliasesOf(a)
  const right = aliasesOf(b)
  for (const value of left) {
    if (value.length < 2 && normalizeName(b) !== value) continue
    if (right.has(value)) return true
  }
  return false
}

export type PlanStatus = 'new' | 'update' | 'same' | 'skip' | 'error'

export const STATUS_LABEL: Record<PlanStatus, string> = {
  new: '신규',
  update: '보완',
  same: '동일',
  skip: '중복',
  error: '확인 필요',
}

export interface CompanyPlan {
  index: number
  status: PlanStatus
  message: string
  input: CompanyInput
  existingId: string | null
}

const COMPANY_TEXT_FIELDS: Exclude<CompanyField, 'name'>[] = ['industry', 'website', 'phone', 'address', 'summary']

export function planCompanies(rows: Record<CompanyField, string>[], existing: Company[]): CompanyPlan[] {
  const plans: CompanyPlan[] = []
  rows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) {
      plans.push({ index, status: 'error', message: '고객사명이 없습니다.', input: { ...row }, existingId: null })
      return
    }
    const earlier = plans.find(
      (plan) => (plan.status === 'new' || plan.status === 'update' || plan.status === 'same') && sameCompanyName(plan.input.name, name),
    )
    if (earlier) {
      if (earlier.status === 'new') {
        for (const field of COMPANY_TEXT_FIELDS) {
          if (!earlier.input[field] && row[field]) earlier.input[field] = row[field]
        }
      }
      plans.push({ index, status: 'skip', message: '붙여넣은 내용에 같은 고객사가 있습니다.', input: { ...row }, existingId: null })
      return
    }
    const found = existing.find((company) => sameCompanyName(company.name, name))
    if (!found) {
      plans.push({ index, status: 'new', message: '', input: { ...row }, existingId: null })
      return
    }
    const merged: CompanyInput = { id: found.id, ...row, name: found.name }
    let filled = 0
    for (const field of COMPANY_TEXT_FIELDS) {
      if (found[field]) merged[field] = found[field]
      else if (row[field]) filled += 1
    }
    plans.push({
      index,
      status: filled > 0 ? 'update' : 'same',
      message: filled > 0 ? '비어 있던 항목만 채웁니다.' : '이미 등록되어 있습니다.',
      input: merged,
      existingId: found.id,
    })
  })
  return plans
}

export interface ContactPlan {
  index: number
  status: PlanStatus
  message: string
  companyName: string
  companyId: string | null
  newCompany: boolean
  input: Omit<ContactInput, 'companyId'> & { id?: string }
  existingId: string | null
}

const CONTACT_TEXT_FIELDS: Exclude<ContactField, 'companyName' | 'name'>[] = ['department', 'position', 'email', 'phone', 'memo']

function rowContact(row: Record<ContactField, string>) {
  return {
    name: row.name,
    department: row.department,
    position: row.position,
    email: row.email,
    phone: row.phone,
    memo: row.memo,
  }
}

export function planContacts(
  rows: Record<ContactField, string>[],
  companies: Company[],
  contacts: Contact[],
): ContactPlan[] {
  const plans: ContactPlan[] = []
  rows.forEach((row, index) => {
    const companyName = row.companyName.trim()
    const name = row.name.trim()
    const base = { index, companyName, companyId: null as string | null, newCompany: false, existingId: null as string | null }
    if (!name) {
      plans.push({ ...base, status: 'error', message: '이름이 없습니다.', input: rowContact(row) })
      return
    }
    if (!companyName) {
      plans.push({ ...base, status: 'error', message: '고객사가 없습니다.', input: rowContact(row) })
      return
    }
    const company = companies.find((item) => sameCompanyName(item.name, companyName))
    const earlier = plans.find(
      (plan) =>
        (plan.status === 'new' || plan.status === 'update' || plan.status === 'same') &&
        sameCompanyName(plan.companyName, companyName) &&
        normalizeName(plan.input.name) === normalizeName(name),
    )
    if (earlier) {
      if (earlier.status === 'new') {
        for (const field of CONTACT_TEXT_FIELDS) {
          if (!earlier.input[field] && row[field]) earlier.input[field] = row[field]
        }
      }
      plans.push({ ...base, status: 'skip', message: '붙여넣은 내용에 같은 담당자가 있습니다.', input: rowContact(row) })
      return
    }
    if (!company) {
      const sibling = plans.find((plan) => plan.newCompany && sameCompanyName(plan.companyName, companyName))
      plans.push({
        ...base,
        companyName: sibling?.companyName ?? companyName,
        newCompany: true,
        status: 'new',
        message: '고객사도 함께 등록합니다.',
        input: rowContact(row),
      })
      return
    }
    const found = contacts.find(
      (contact) =>
        contact.companyId === company.id &&
        (normalizeName(contact.name) === normalizeName(name) ||
          (row.email !== '' && contact.email !== '' && contact.email.toLowerCase() === row.email.toLowerCase())),
    )
    if (!found) {
      plans.push({ ...base, companyId: company.id, companyName: company.name, status: 'new', message: '', input: rowContact(row) })
      return
    }
    const merged = { ...rowContact(row), id: found.id, name: found.name }
    let filled = 0
    for (const field of CONTACT_TEXT_FIELDS) {
      if (found[field]) merged[field] = found[field]
      else if (row[field]) filled += 1
    }
    plans.push({
      ...base,
      companyId: company.id,
      companyName: company.name,
      existingId: found.id,
      status: filled > 0 ? 'update' : 'same',
      message: filled > 0 ? '비어 있던 항목만 채웁니다.' : '이미 등록되어 있습니다.',
      input: merged,
    })
  })
  return plans
}

export function countByStatus(plans: { status: PlanStatus }[]) {
  const counts: Record<PlanStatus, number> = { new: 0, update: 0, same: 0, skip: 0, error: 0 }
  for (const plan of plans) counts[plan.status] += 1
  return counts
}

export function defaultSelection(plans: { index: number; status: PlanStatus }[]) {
  return new Set(plans.filter((plan) => plan.status === 'new' || plan.status === 'update').map((plan) => plan.index))
}

export interface ImportRunner {
  saveCompany: (input: CompanyInput) => Promise<string>
  saveContact: (input: ContactInput) => Promise<string>
}

export interface ImportSummary {
  companiesCreated: number
  created: number
  updated: number
  failed: { index: number; message: string }[]
}

const FAILED = '저장하지 못했습니다.'

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : FAILED
}

export async function runCompanyPlan(
  plans: CompanyPlan[],
  selected: Set<number>,
  runner: ImportRunner,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = { companiesCreated: 0, created: 0, updated: 0, failed: [] }
  const targets = plans.filter((plan) => selected.has(plan.index) && (plan.status === 'new' || plan.status === 'update'))
  let done = 0
  for (const plan of targets) {
    try {
      await runner.saveCompany(plan.input)
      if (plan.status === 'new') summary.created += 1
      else summary.updated += 1
    } catch (error) {
      summary.failed.push({ index: plan.index, message: messageOf(error) })
    }
    done += 1
    onProgress?.(done, targets.length)
  }
  return summary
}

export async function runContactPlan(
  plans: ContactPlan[],
  selected: Set<number>,
  runner: ImportRunner,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = { companiesCreated: 0, created: 0, updated: 0, failed: [] }
  const targets = plans.filter((plan) => selected.has(plan.index) && (plan.status === 'new' || plan.status === 'update'))
  const created = new Map<string, string>()
  let done = 0
  for (const plan of targets) {
    let companyId = plan.companyId
    try {
      if (!companyId) {
        const key = normalizeName(plan.companyName)
        let id = created.get(key)
        if (!id) {
          id = await runner.saveCompany({ name: plan.companyName, industry: '', website: '', phone: '', address: '', summary: '' })
          created.set(key, id)
          summary.companiesCreated += 1
        }
        companyId = id
      }
      await runner.saveContact({ ...plan.input, companyId })
      if (plan.status === 'new') summary.created += 1
      else summary.updated += 1
    } catch (error) {
      summary.failed.push({ index: plan.index, message: messageOf(error) })
    }
    done += 1
    onProgress?.(done, targets.length)
  }
  return summary
}
