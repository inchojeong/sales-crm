import { describe, expect, it } from 'vitest'
import { datesFromYear, mapOutcome, planPortfolio, rowsFromSheet } from './portfolioImport'

const HEADER = [
  'No.',
  '기업·기관명',
  '관계 구분',
  '사업연도',
  '분야(잠정)',
  '관련 사업',
  '기존 아이템·역할',
  '상태(잠정)',
  '근거자료',
  '비고·검증 필요',
  '홈페이지',
  '담당자',
  '이메일',
  '전화번호',
  '최근 접촉일',
  '후속 제안 사업',
  '후속 제안 아이템',
  '우선순위',
  '사업비·계약금액',
]

describe('rowsFromSheet', () => {
  it('reads rows under the company header and skips the title line', () => {
    const rows = rowsFromSheet([
      ['TBELL | 통합 DB'],
      HEADER,
      [1, '옵토전자', '데이터바우처 과거 고객', '2020', '전자·제조', '데이터바우처', 'AI 검수', '수행 이력', '계획서.pdf', '', '', '', '', '', '', '', '', '', ''],
      [2, '', '빈 행'],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ companyName: '옵토전자', fiscalYear: '2020', program: '데이터바우처', item: 'AI 검수' })
  })
})

describe('mapOutcome', () => {
  it('maps past performance, in-progress work, and rows that still need checking', () => {
    expect(mapOutcome('수행 이력').outcome).toBe('completed')
    expect(mapOutcome('수행 중').outcome).toBe('running')
    expect(mapOutcome('신청 결과 확인 필요').needsReview).toBe(true)
    expect(mapOutcome('견적 제출').outcome).toBe('applied')
  })
})

describe('datesFromYear', () => {
  it('uses the first and last year in the cell', () => {
    expect(datesFromYear('2020-2022')).toEqual({ startDate: '2020-01-01', endDate: '2022-12-31' })
    expect(datesFromYear('', '2026-11-26').startDate).toBe('2026-01-01')
  })
})

describe('planPortfolio', () => {
  const rows = rowsFromSheet([
    HEADER,
    [1, '옵토전자', '과거 고객', '2020', '전자', '데이터바우처', '검수', '수행 이력', '', '사업자번호 확인', '', '', '', '', '', '', '', '', ''],
    [2, '테스(주)', '신규', '2025', '반도체', 'AI바우처', '제안', '신청·제안', '', '', '', '이성웅', 'a@test.kr', '010', '', '스마트공장', '재신청', '높음', ''],
    [3, '옵토전자', '과거 고객', '2020', '전자', '데이터바우처', '검수', '수행 이력', '', '', '', '', '', '', '', '', '', '', ''],
  ])

  it('marks a matching history as already stored and keeps a new company row', () => {
    const plans = planPortfolio(rows, [{ id: 'c1', name: '옵토전자' }], [{ companyId: 'c1', name: '2020 데이터바우처', program: '데이터바우처', fiscalYear: '2020' }])
    expect(plans[0].plan).toBe('same')
    expect(plans[0].include).toBe(false)
    expect(plans[0].needsReview).toBe(true)
    expect(plans[1].plan).toBe('new')
    expect(plans[1].companyId).toBeUndefined()
    expect(plans[1].contactName).toBe('이성웅')
    expect(plans[1].businessName).toBe('2025 AI바우처')
  })
})
