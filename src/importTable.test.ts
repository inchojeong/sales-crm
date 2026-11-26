import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  defaultSelection,
  parseCompanyTable,
  parseContactTable,
  planCompanies,
  planContacts,
  runCompanyPlan,
  runContactPlan,
  sameCompanyName,
  splitRows,
  type ImportRunner,
} from './importTable'
import type { Company, CompanyInput, Contact, ContactInput } from './types'

function company(id: string, name: string, extra: Partial<Company> = {}): Company {
  return { id, name, industry: '', website: '', phone: '', address: '', summary: '', ...extra }
}

function contact(id: string, companyId: string, name: string, extra: Partial<Contact> = {}): Contact {
  return { id, companyId, name, department: '', position: '', email: '', phone: '', memo: '', ...extra }
}

describe('표 나누기', () => {
  it('탭으로 구분된 엑셀 복사본을 읽는다', () => {
    expect(splitRows('고객사\t이름\n테스\t이성웅')).toEqual([
      ['고객사', '이름'],
      ['테스', '이성웅'],
    ])
  })

  it('쉼표 구분 CSV와 따옴표 안의 줄바꿈을 읽는다', () => {
    expect(splitRows('a,b\n"x, y","줄1\n줄2"')).toEqual([
      ['a', 'b'],
      ['x, y', '줄1\n줄2'],
    ])
  })

  it('빈 줄은 건너뛰고 윈도우 줄바꿈도 읽는다', () => {
    expect(splitRows('a\tb\r\n\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('머리글 매핑', () => {
  it('머리글 이름으로 열 순서와 상관없이 맞춘다', () => {
    const table = parseContactTable('이메일\t이름\t회사명\t직책\na@b.co\t이성웅\t테스\t책임')
    expect(table.hasHeader).toBe(true)
    expect(table.rows[0]).toMatchObject({ companyName: '테스', name: '이성웅', position: '책임', email: 'a@b.co' })
  })

  it('머리글이 없으면 기본 열 순서를 쓴다', () => {
    const table = parseContactTable('테스\t이성웅\t사업기획\t책임')
    expect(table.hasHeader).toBe(false)
    expect(table.rows[0]).toMatchObject({ companyName: '테스', name: '이성웅', department: '사업기획', position: '책임' })
  })

  it('고객사 머리글을 읽는다', () => {
    const table = parseCompanyTable('기업명\t업종\t홈페이지\n테스\t반도체\thttps://tes.example')
    expect(table.rows[0]).toMatchObject({ name: '테스', industry: '반도체', website: 'https://tes.example' })
  })

  it('500행을 넘으면 잘라 내고 알린다', () => {
    const lines = Array.from({ length: 501 }, (_, index) => `회사${index}`).join('\n')
    const table = parseCompanyTable(lines)
    expect(table.rows).toHaveLength(500)
    expect(table.truncated).toBe(true)
  })
})

describe('고객사 이름 비교', () => {
  it('㈜와 공백과 괄호 별칭을 무시한다', () => {
    expect(sameCompanyName('㈜유알커넥션', '유알커넥션')).toBe(true)
    expect(sameCompanyName('(주) 키자미 테이블', '키자미테이블')).toBe(true)
    expect(sameCompanyName('테스(Tes)', '테스')).toBe(true)
    expect(sameCompanyName('테스(Tes)', 'TES')).toBe(true)
  })

  it('이름이 다르면 다른 고객사다', () => {
    expect(sameCompanyName('테스', '테스트')).toBe(false)
  })
})

describe('고객사 계획', () => {
  const existing = [company('co-tes', '테스(Tes)', { industry: '반도체' })]

  it('없는 고객사는 신규다', () => {
    const rows = parseCompanyTable('유알커넥션\t제조').rows
    const plans = planCompanies(rows, existing)
    expect(plans[0].status).toBe('new')
  })

  it('같은 고객사는 동일이고 저장 대상이 아니다', () => {
    const plans = planCompanies(parseCompanyTable('테스\t반도체').rows, existing)
    expect(plans[0].status).toBe('same')
    expect(defaultSelection(plans).size).toBe(0)
  })

  it('기존 값은 지키고 빈 항목만 채운다', () => {
    const rows = parseCompanyTable('고객사명\t업종\t홈페이지\n테스\t다른업종\thttps://tes.example').rows
    const plans = planCompanies(rows, existing)
    expect(plans[0].status).toBe('update')
    expect(plans[0].existingId).toBe('co-tes')
    expect(plans[0].input.industry).toBe('반도체')
    expect(plans[0].input.website).toBe('https://tes.example')
  })

  it('붙여넣은 내용 안의 중복은 건너뛴다', () => {
    const rows = parseCompanyTable('고객사명\t업종\n신규\t\n㈜신규\t제조').rows
    const plans = planCompanies(rows, existing)
    expect(plans.map((plan) => plan.status)).toEqual(['new', 'skip'])
    expect(plans[0].input.industry).toBe('제조')
  })

  it('고객사명이 없으면 확인 필요다', () => {
    const plans = planCompanies(parseCompanyTable('고객사명\t업종\n\t제조').rows, existing)
    expect(plans[0].status).toBe('error')
    expect(countByStatus(plans).error).toBe(1)
  })
})

describe('담당자 계획', () => {
  const companies = [company('co-tes', '테스(Tes)'), company('co-ur', '㈜유알커넥션')]
  const contacts = [contact('ct-lee', 'co-tes', '이성웅', { position: '책임' })]

  it('등록된 고객사의 새 담당자는 신규다', () => {
    const rows = parseContactTable('고객사\t이름\n테스\t김하나').rows
    const plans = planContacts(rows, companies, contacts)
    expect(plans[0]).toMatchObject({ status: 'new', companyId: 'co-tes', newCompany: false })
  })

  it('없는 고객사는 함께 만들도록 표시한다', () => {
    const rows = parseContactTable('고객사\t이름\n신생기업\t김하나\n신생기업\t박둘').rows
    const plans = planContacts(rows, companies, contacts)
    expect(plans.every((plan) => plan.newCompany && plan.status === 'new')).toBe(true)
  })

  it('같은 고객사의 같은 이름은 동일 처리하고 빈 항목만 채운다', () => {
    const rows = parseContactTable('고객사\t이름\t직급\t이메일\n테스\t이성웅\t부장\tlee@tes.example').rows
    const plans = planContacts(rows, companies, contacts)
    expect(plans[0].status).toBe('update')
    expect(plans[0].input.position).toBe('책임')
    expect(plans[0].input.email).toBe('lee@tes.example')
    expect(plans[0].existingId).toBe('ct-lee')
  })

  it('다른 고객사의 같은 이름은 별개 담당자다', () => {
    const rows = parseContactTable('고객사\t이름\n유알커넥션\t이성웅').rows
    expect(planContacts(rows, companies, contacts)[0].status).toBe('new')
  })

  it('이름이나 고객사가 없으면 확인 필요다', () => {
    const rows = parseContactTable('고객사\t이름\n\t김하나\n테스\t').rows
    const plans = planContacts(rows, companies, contacts)
    expect(plans.map((plan) => plan.status)).toEqual(['error', 'error'])
  })

  it('붙여넣은 내용 안의 같은 담당자는 건너뛴다', () => {
    const rows = parseContactTable('고객사\t이름\t이메일\n테스\t김하나\t\n테스\t김하나\ta@b.co').rows
    const plans = planContacts(rows, companies, contacts)
    expect(plans.map((plan) => plan.status)).toEqual(['new', 'skip'])
    expect(plans[0].input.email).toBe('a@b.co')
  })
})

describe('저장 실행', () => {
  function runner() {
    const saved = { companies: [] as CompanyInput[], contacts: [] as ContactInput[] }
    const api: ImportRunner = {
      async saveCompany(input) {
        saved.companies.push(input)
        return `new-${saved.companies.length}`
      },
      async saveContact(input) {
        saved.contacts.push(input)
        return `ct-${saved.contacts.length}`
      },
    }
    return { api, saved }
  }

  it('선택한 신규 고객사만 저장한다', async () => {
    const { api, saved } = runner()
    const plans = planCompanies(parseCompanyTable('고객사명\nA사\nB사').rows, [])
    const summary = await runCompanyPlan(plans, new Set([0]), api)
    expect(saved.companies.map((item) => item.name)).toEqual(['A사'])
    expect(summary.created).toBe(1)
  })

  it('없는 고객사는 한 번만 만들고 담당자를 연결한다', async () => {
    const { api, saved } = runner()
    const rows = parseContactTable('고객사\t이름\n신생\t김하나\n신생\t박둘').rows
    const plans = planContacts(rows, [], [])
    const summary = await runContactPlan(plans, defaultSelection(plans), api)
    expect(saved.companies).toHaveLength(1)
    expect(saved.contacts.map((item) => item.companyId)).toEqual(['new-1', 'new-1'])
    expect(summary).toMatchObject({ companiesCreated: 1, created: 2, failed: [] })
  })

  it('한 행이 실패해도 나머지는 계속 저장하고 실패를 알린다', async () => {
    const { saved } = runner()
    const failing: ImportRunner = {
      async saveCompany(input) {
        if (input.name === 'B사') throw new Error('저장하지 못했습니다.')
        saved.companies.push(input)
        return 'id'
      },
      async saveContact() {
        return 'id'
      },
    }
    const plans = planCompanies(parseCompanyTable('고객사명\nA사\nB사\nC사').rows, [])
    const summary = await runCompanyPlan(plans, defaultSelection(plans), failing)
    expect(saved.companies.map((item) => item.name)).toEqual(['A사', 'C사'])
    expect(summary.failed).toEqual([{ index: 1, message: '저장하지 못했습니다.' }])
  })

  it('진행 상황을 알린다', async () => {
    const { api } = runner()
    const plans = planCompanies(parseCompanyTable('고객사명\nA사\nB사').rows, [])
    const steps: number[] = []
    await runCompanyPlan(plans, defaultSelection(plans), api, (done) => steps.push(done))
    expect(steps).toEqual([1, 2])
  })
})
