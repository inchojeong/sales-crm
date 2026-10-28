import type { SupabaseClient } from '@supabase/supabase-js'

const FLAG = 'sales-crm-provided-businesses-v1'

interface CompanyName {
  id: string
  name: string
}

interface ProvidedBusiness {
  name: string
  companyName: string
  overview: string
}

const PROVIDED: ProvidedBusiness[] = [
  {
    name: 'AI 기반 작업영상 분석 및 숙련도 평가 플랫폼 구축',
    companyName: '㈜유알커넥션',
    overview: [
      '2026년 중소기업 스마트서비스 지원사업',
      '과제번호 SF26181431',
      '수행기업 ㈜티벨',
      '내부 담당자 주호정 (사업전략팀)',
      '',
      '해외 기능인력의 작업영상 데이터를 활용하여 작업자의 행동 및 숙련도를 분석·평가하는 AI 기반 시스템 구축 사업.',
      '작업영상 업로드, 작업 단계·이벤트 라벨링, AI 기반 동작 분석, 숙련도 산정, 평가 결과 시각화 및 리포트 기능을 개발한다.',
      '분해·조립 작업을 중심으로 작업유형·제품군·부품별 평가 기준을 정의하고, NCS 기준과 연계한 작업자 평가 체계 구축을 추진한다.',
      '',
      '사업계획서상 과제명은 ‘AI 기반 작업 영상 분석을 위한 숙련도 데이터 구축·모니터링 플랫폼 개발’이다.',
    ].join('\n'),
  },
  {
    name: 'KIJANIFY 농업 공급망 탄소·EUDR 관리 시스템 구축',
    companyName: '㈜키자미테이블',
    overview: [
      '2026년 중소기업 스마트서비스 지원사업',
      '과제번호 SF26181616',
      '수행기업 ㈜티벨',
      '내부 담당자 주호정 (사업전략팀)',
      '',
      '커피·코코아 등 농업 공급망의 생산자, 농장, 협동조합 및 거래 데이터를 통합 관리하고, 탄소배출량 산정과 EU 산림전용방지규정(EUDR) 대응을 지원하는 KIJANIFY 시스템 구축 사업.',
      '생산자·농장정보 관리, 현장조사 및 GPS 기반 데이터 검증, 공급망 데이터 통합, 탄소배출량 계산, DDS 문서 생성, 증빙 관리 및 운영 대시보드 등의 기능을 개발한다.',
      'EUDR 및 DDS 대응 기능을 우선 구축하고, 데이터의 누락·중복·오류 검증과 업무별 사용자 권한·승인 절차를 체계화한다.',
      '',
      '사업계획서상 명칭은 ‘커피·코코아 등 농업 공급망 기반 탄소·ESG/EUDR 대응 시스템 KIJANIFY 구축’이다.',
    ].join('\n'),
  },
]

function compactName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/㈜|\(주\)|주식회사/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

let importTask: Promise<boolean> | null = null
let reportedCreate = false

export function importProvidedBusinesses(client: SupabaseClient) {
  if (!importTask) {
    importTask = runImport(client).catch((error) => {
      importTask = null
      throw error
    })
  }
  return importTask.then((created) => {
    if (!created || reportedCreate) return false
    reportedCreate = true
    return true
  })
}

async function runImport(client: SupabaseClient) {
  try {
    if (localStorage.getItem(FLAG) === '1') return false
  } catch {
    return false
  }

  const { data: companies, error: companyError } = await client.from('companies').select('id, name')
  if (companyError) throw companyError
  const { data: businesses, error: businessError } = await client.from('businesses').select('id, name, company_id')
  if (businessError) throw businessError

  const companyRows = (companies ?? []) as CompanyName[]
  const businessRows = (businesses ?? []) as { name: string; company_id: string }[]
  let created = false

  for (const item of PROVIDED) {
    const wanted = compactName(item.companyName)
    let company = companyRows.find((row) => compactName(row.name) === wanted)
    if (!company) {
      const { data, error } = await client
        .from('companies')
        .insert({ name: item.companyName, industry: '', website: '', phone: '', address: '', summary: '' })
        .select('id, name')
        .single()
      if (error || !data) throw error ?? new Error('company')
      company = data as CompanyName
      companyRows.push(company)
    }

    const exists = businessRows.some(
      (row) => compactName(row.name) === compactName(item.name) && row.company_id === company.id,
    )
    if (exists) continue

    const { error } = await client.from('businesses').insert({
      name: item.name,
      overview: item.overview,
      type: 'government',
      status: 'active',
      start_date: '2026-08-03',
      end_date: '2027-02-02',
      company_id: company.id,
    })
    if (error) throw error
    created = true
    businessRows.push({ name: item.name, company_id: company.id })
  }

  try {
    localStorage.setItem(FLAG, '1')
  } catch {
    /* the rows are already saved */
  }
  return created
}
