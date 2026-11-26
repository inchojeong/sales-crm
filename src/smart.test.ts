import { describe, expect, it } from 'vitest'
import { lastContactIds, splitPersonText } from './smart'
import type { Activity } from './types'

function activity(id: string, date: string, companyId: string | null, contactIds: string[], createdAt = date): Activity {
  return {
    id,
    date,
    type: 'meeting',
    title: id,
    companyId,
    contactIds,
    eventId: null,
    businessId: null,
    purpose: 'intro',
    status: 'done',
    notes: '',
    opinion: '',
    startTime: null,
    endTime: null,
    authorId: 'u',
    relatedActivityId: null,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('직전 담당자', () => {
  const valid = new Set(['a', 'b', 'c'])

  it('같은 고객사의 가장 최근 활동 담당자를 돌려준다', () => {
    const list = [activity('1', '2026-10-01', 'co', ['a']), activity('2', '2026-10-20', 'co', ['b', 'c']), activity('3', '2026-10-25', 'other', ['a'])]
    expect(lastContactIds('co', list, valid)).toEqual(['b', 'c'])
  })

  it('사라진 담당자는 제외한다', () => {
    const list = [activity('1', '2026-10-20', 'co', ['b', 'gone'])]
    expect(lastContactIds('co', list, valid)).toEqual(['b'])
  })

  it('담당자가 남아 있는 활동이 없으면 빈 목록이다', () => {
    const list = [activity('1', '2026-10-20', 'co', ['gone']), activity('2', '2026-10-21', 'co', [])]
    expect(lastContactIds('co', list, valid)).toEqual([])
  })

  it('날짜가 같으면 나중에 만든 활동을 쓴다', () => {
    const list = [activity('1', '2026-10-20', 'co', ['a'], '2026-10-20T01:00:00Z'), activity('2', '2026-10-20', 'co', ['b'], '2026-10-20T05:00:00Z')]
    expect(lastContactIds('co', list, valid)).toEqual(['b'])
  })
})

describe('담당자 이름 나누기', () => {
  it('이름과 직급을 나눈다', () => {
    expect(splitPersonText('이성웅 책임')).toEqual({ name: '이성웅', position: '책임' })
    expect(splitPersonText('  김하나  ')).toEqual({ name: '김하나', position: '' })
    expect(splitPersonText('')).toEqual({ name: '', position: '' })
  })
})
