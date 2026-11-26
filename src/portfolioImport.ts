import type { BusinessOutcome, BusinessStatus, BusinessType } from './business'
import { sameCompanyName } from './importTable'

export const PORTFOLIO_SOURCE = '정부지원사업 DB 2026-11-26'

export interface PortfolioRow {
  companyName: string
  relation: string
  fiscalYear: string
  industry: string
  program: string
  item: string
  statusText: string
  evidence: string
  reviewNote: string
  website: string
  contactName: string
  email: string
  phone: string
  lastContact: string
  followProgram: string
  followItem: string
  priority: string
  amount: string
}

export interface HistoryDraft extends PortfolioRow {
  index: number
  include: boolean
  outcome: BusinessOutcome
  needsReview: boolean
  businessType: BusinessType
  businessStatus: BusinessStatus
  startDate: string
  endDate: string
  businessName: string
  plan: 'new' | 'same' | 'error'
  message: string
  companyId?: string
}

const HEADER_ALIASES: Record<keyof PortfolioRow, string[]> = {
  companyName: ['기업·기관명', '기업명', '기관명', '고객사', '고객사명'],
  relation: ['관계 구분', '관계구분'],
  fiscalYear: ['사업연도', '연도'],
  industry: ['분야(잠정)', '분야', '업종'],
  program: ['관련 사업', '사업명'],
  item: ['기존 아이템·역할', '아이템', '역할'],
  statusText: ['상태(잠정)', '상태'],
  evidence: ['근거자료', '근거'],
  reviewNote: ['비고·검증 필요', '비고', '검증'],
  website: ['홈페이지'],
  contactName: ['담당자'],
  email: ['이메일'],
  phone: ['전화번호', '연락처'],
  lastContact: ['최근 접촉일'],
  followProgram: ['후속 제안 사업'],
  followItem: ['후속 제안 아이템'],
  priority: ['우선순위'],
  amount: ['사업비·계약금액', '사업비', '계약금액'],
}

function cell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function rowsFromSheet(matrix: unknown[][]): PortfolioRow[] {
  const headerIndex = matrix.findIndex((row) => row.some((item) => cell(item) === '기업·기관명'))
  if (headerIndex < 0) return []
  const header = matrix[headerIndex].map(cell)
  const indexOf = (key: keyof PortfolioRow) => header.findIndex((label) => HEADER_ALIASES[key].includes(label))
  const columns = Object.keys(HEADER_ALIASES) as (keyof PortfolioRow)[]
  return matrix
    .slice(headerIndex + 1)
    .map((row) => {
      const draft = {} as PortfolioRow
      for (const key of columns) {
        const index = indexOf(key)
        draft[key] = index >= 0 ? cell(row[index]) : ''
      }
      return draft
    })
    .filter((row) => row.companyName.length > 0)
}

export function mapOutcome(statusText: string): { outcome: BusinessOutcome; businessStatus: BusinessStatus; needsReview: boolean } {
  const text = statusText.replace(/\s/g, '')
  if (/확인|재확인|판독/.test(text)) return { outcome: 'unknown', businessStatus: 'preparing', needsReview: true }
  if (/미선정/.test(text)) return { outcome: 'not_selected', businessStatus: 'done', needsReview: false }
  if (/중단|포기/.test(text)) return { outcome: 'dropped', businessStatus: 'stopped', needsReview: false }
  if (/수행완료|완료/.test(text)) return { outcome: 'completed', businessStatus: 'done', needsReview: false }
  if (/수행이력/.test(text)) return { outcome: 'completed', businessStatus: 'done', needsReview: false }
  if (/수행중/.test(text)) return { outcome: 'running', businessStatus: 'active', needsReview: false }
  if (/선정|협약|계약/.test(text)) return { outcome: 'selected', businessStatus: 'active', needsReview: false }
  if (/신청|제안|견적|협력|기획|참여/.test(text)) return { outcome: 'applied', businessStatus: 'preparing', needsReview: false }
  if (!text) return { outcome: 'unknown', businessStatus: 'preparing', needsReview: true }
  return { outcome: 'unknown', businessStatus: 'preparing', needsReview: true }
}

export function guessBusinessType(program: string, relation: string): BusinessType {
  const text = `${program} ${relation}`
  if (/연구|용역|PHM|R&D|과제/.test(text)) return 'rnd'
  if (/공공|공모|해병/.test(text)) return 'b2g'
  if (/바우처|스마트|지원|AX|공장/.test(text)) return 'government'
  return 'other'
}

export function datesFromYear(fiscalYear: string, today = '2026-01-01') {
  const years = [...fiscalYear.matchAll(/(?:19|20)\d{2}/g)].map((match) => match[0])
  if (years.length === 0) {
    const year = today.slice(0, 4)
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` }
  }
  return { startDate: `${years[0]}-01-01`, endDate: `${years[years.length - 1]}-12-31` }
}

export function historyBusinessName(row: Pick<PortfolioRow, 'fiscalYear' | 'program' | 'item' | 'companyName'>) {
  const titled = [row.fiscalYear, row.program].filter(Boolean).join(' ').trim()
  return titled || row.item || `${row.companyName} 사업 이력`
}

function lessonOf(row: Pick<PortfolioRow, 'followProgram' | 'followItem'>) {
  const parts = [row.followProgram, row.followItem].filter(Boolean)
  return parts.length > 0 ? `후속 제안: ${parts.join(' / ')}` : ''
}

export function lessonText(row: Pick<PortfolioRow, 'followProgram' | 'followItem'>) {
  return lessonOf(row)
}

export function planPortfolio(
  rows: PortfolioRow[],
  companies: { id: string; name: string }[],
  businesses: { companyId: string; name: string; program?: string; fiscalYear?: string }[],
  today = '2026-01-01',
): HistoryDraft[] {
  return rows.map((row, index) => {
    const mapped = mapOutcome(row.statusText)
    const dates = datesFromYear(row.fiscalYear, today)
    const businessName = historyBusinessName(row)
    const company = companies.find((item) => sameCompanyName(item.name, row.companyName))
    const needsReview = mapped.needsReview || Boolean(row.reviewNote)
    const base: HistoryDraft = {
      ...row,
      index,
      include: true,
      outcome: mapped.outcome,
      needsReview,
      businessType: guessBusinessType(row.program, row.relation),
      businessStatus: mapped.businessStatus,
      startDate: dates.startDate,
      endDate: dates.endDate,
      businessName,
      plan: 'new',
      message: company ? '기존 고객사에 이력을 추가합니다.' : '새 고객사와 이력을 등록합니다.',
      companyId: company?.id,
    }
    if (!row.program && !row.item) {
      return { ...base, include: false, plan: 'error', message: '관련 사업 또는 아이템이 없습니다.' }
    }
    const duplicate = company
      ? businesses.some(
          (item) =>
            item.companyId === company.id &&
            (sameCompanyName(item.name, businessName) ||
              (item.program === row.program && item.fiscalYear === row.fiscalYear && row.program.length > 0)),
        )
      : false
    if (duplicate) {
      return { ...base, include: false, plan: 'same', message: '같은 고객사에 같은 사업 이력이 있습니다.' }
    }
    return base
  })
}
