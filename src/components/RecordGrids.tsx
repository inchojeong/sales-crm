import { useRecordSource } from '../records'
import type { Company, Contact } from '../types'
import { useUI } from '../ui'
import { EditableGrid, type GridColumn } from './EditableGrid'

const COMPANY_COLUMNS: GridColumn<Company>[] = [
  { key: 'name', label: '고객사명', get: (row) => row.name, required: true, width: 220 },
  { key: 'industry', label: '업종', get: (row) => row.industry, width: 140 },
  { key: 'website', label: '홈페이지', get: (row) => row.website, width: 200 },
  { key: 'phone', label: '대표 연락처', get: (row) => row.phone, width: 150 },
  { key: 'address', label: '주소', get: (row) => row.address },
]

export function CompanyGrid() {
  const records = useRecordSource()
  const { go } = useUI()
  const rows = [...records.companies].sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  async function commit(row: Company, key: string, value: string) {
    await records.saveCompany({
      id: row.id,
      name: row.name,
      industry: row.industry,
      website: row.website,
      phone: row.phone,
      address: row.address,
      summary: row.summary,
      [key]: value,
    })
  }

  return (
    <EditableGrid
      rows={rows}
      columns={COMPANY_COLUMNS}
      onCommit={commit}
      onOpen={(row) => go({ name: 'company', id: row.id })}
      empty="등록된 고객사가 없습니다."
    />
  )
}

export function ContactGrid() {
  const records = useRecordSource()
  const { go } = useUI()
  const names = new Map(records.companies.map((company) => [company.id, company.name]))
  const rows = [...records.contacts].sort(
    (a, b) =>
      (names.get(a.companyId) ?? '').localeCompare(names.get(b.companyId) ?? '', 'ko') || a.name.localeCompare(b.name, 'ko'),
  )

  const columns: GridColumn<Contact>[] = [
    { key: 'company', label: '고객사', get: (row) => names.get(row.companyId) ?? '', readOnly: true, width: 200 },
    { key: 'name', label: '이름', get: (row) => row.name, required: true, width: 120 },
    { key: 'department', label: '부서', get: (row) => row.department, width: 140 },
    { key: 'position', label: '직급', get: (row) => row.position, width: 100 },
    { key: 'email', label: '이메일', get: (row) => row.email, width: 200 },
    { key: 'phone', label: '연락처', get: (row) => row.phone },
  ]

  async function commit(row: Contact, key: string, value: string) {
    await records.saveContact({
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      department: row.department,
      position: row.position,
      email: row.email,
      phone: row.phone,
      memo: row.memo,
      [key]: value,
    })
  }

  return (
    <EditableGrid
      rows={rows}
      columns={columns}
      onCommit={commit}
      onOpen={(row) => go({ name: 'contact', id: row.id })}
      empty="등록된 담당자가 없습니다."
    />
  )
}
