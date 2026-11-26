import { describe, expect, it } from 'vitest'
import { captureEnd, captureNotes, captureTitle, parseQuickInput, type CaptureContext } from './quickCapture'

const ctx: CaptureContext = {
  today: '2026-10-28',
  nowTime: '09:00',
  companies: [
    { id: 'co-tes', name: '테스(Tes)' },
    { id: 'co-ur', name: '㈜유알커넥션' },
    { id: 'co-kiz', name: '㈜키자미테이블' },
    { id: 'co-a', name: 'A 제조기업' },
    { id: 'co-b', name: 'B 시스템' },
  ],
  contacts: [
    { id: 'ct-lee', companyId: 'co-tes', name: '이성웅', position: '책임' },
    { id: 'ct-kim-a', companyId: 'co-a', name: '김민수', position: '부장' },
    { id: 'ct-kim-b', companyId: 'co-b', name: '김민수', position: '과장' },
    { id: 'ct-park', companyId: 'co-a', name: '박지훈', position: '과장' },
  ],
  businesses: [
    { id: 'biz-ai', name: 'AI 기반 작업영상 분석 및 숙련도 평가 플랫폼 구축', companyId: 'co-ur' },
    { id: 'biz-kij', name: 'KIJANIFY 농업 공급망 탄소·EUDR 관리 시스템 구축', companyId: 'co-kiz' },
  ],
  events: [{ id: 'ev-kosa', name: 'KOSA 주최 제조 AX Connect Day' }],
}

describe('날짜', () => {
  it('월/일 표기는 올해 날짜로 해석한다', () => {
    const draft = parseQuickInput('10/30 미팅', ctx)
    expect(draft.date).toBe('2026-10-30')
    expect(draft.dateFound).toBe(true)
    expect(draft.status).toBe('planned')
  })

  it('내일, 모레 같은 상대 날짜를 해석한다', () => {
    expect(parseQuickInput('내일 미팅', ctx).date).toBe('2026-10-29')
    expect(parseQuickInput('모레 전화', ctx).date).toBe('2026-10-30')
  })

  it('다음주 요일은 일요일 시작 주 기준이다', () => {
    expect(parseQuickInput('다음주 화요일 미팅', ctx).date).toBe('2026-11-03')
    expect(parseQuickInput('이번주 금 미팅', ctx).date).toBe('2026-10-30')
  })

  it('요일만 쓰면 오늘 이후 가장 가까운 날이다', () => {
    expect(parseQuickInput('금요일 미팅', ctx).date).toBe('2026-10-30')
    expect(parseQuickInput('수요일 미팅', ctx).date).toBe('2026-10-28')
  })

  it('연도와 한글 표기를 해석한다', () => {
    expect(parseQuickInput('2026-12-01 전화', ctx).date).toBe('2026-12-01')
    expect(parseQuickInput('12월 3일 미팅', ctx).date).toBe('2026-12-03')
  })

  it('날짜가 없으면 오늘이고 날짜 인식 여부는 false다', () => {
    const draft = parseQuickInput('미팅', ctx)
    expect(draft.date).toBe('2026-10-28')
    expect(draft.dateFound).toBe(false)
  })

  it('존재하지 않는 날짜는 무시한다', () => {
    expect(parseQuickInput('2/31 미팅', ctx).dateFound).toBe(false)
  })

  it('지난 날짜는 완료로 둔다', () => {
    expect(parseQuickInput('어제 미팅', ctx).status).toBe('done')
  })
})

describe('시간', () => {
  it('오후와 시 표기를 24시간으로 바꾼다', () => {
    expect(parseQuickInput('오후 2시 미팅', ctx).startTime).toBe('14:00')
    expect(parseQuickInput('2시 미팅', ctx).startTime).toBe('14:00')
    expect(parseQuickInput('9시 미팅', ctx).startTime).toBe('09:00')
    expect(parseQuickInput('오전 12시 미팅', ctx).startTime).toBe('00:00')
    expect(parseQuickInput('14시 30분 미팅', ctx).startTime).toBe('14:30')
    expect(parseQuickInput('3시 반 미팅', ctx).startTime).toBe('15:30')
  })

  it('범위를 시작과 종료로 나눈다', () => {
    const colon = parseQuickInput('14:00-15:30 미팅', ctx)
    expect([colon.startTime, colon.endTime]).toEqual(['14:00', '15:30'])
    const korean = parseQuickInput('오전 10시-11시30분 전화', ctx)
    expect([korean.startTime, korean.endTime]).toEqual(['10:00', '11:30'])
  })

  it('종료가 시작보다 빠르면 종료를 버린다', () => {
    const draft = parseQuickInput('15:00-14:00 미팅', ctx)
    expect(draft.endTime).toBeNull()
  })

  it('종료가 없으면 한 시간 뒤로 맞춘다', () => {
    expect(captureEnd('14:00', null)).toBe('15:00')
    expect(captureEnd(null, null)).toBeNull()
  })

  it('날짜 숫자를 시간으로 오해하지 않는다', () => {
    const draft = parseQuickInput('10/30 미팅', ctx)
    expect(draft.startTime).toBeNull()
  })

  it('오늘 일정이 지금보다 이후 시각이면 예정이다', () => {
    expect(parseQuickInput('오늘 14시 미팅', ctx).status).toBe('planned')
    expect(parseQuickInput('오늘 8시 미팅', ctx).status).toBe('done')
  })
})

describe('유형과 목적', () => {
  it('가장 앞에 나온 유형 단어를 쓴다', () => {
    expect(parseQuickInput('10/30 미팅 AX 제안', ctx).type).toBe('meeting')
    expect(parseQuickInput('메일 발송', ctx).type).toBe('email')
    expect(parseQuickInput('통화', ctx).type).toBe('call')
    expect(parseQuickInput('견적 전달', ctx).type).toBe('proposal')
    expect(parseQuickInput('방문', ctx).type).toBe('other')
  })

  it('유형이 없으면 비워 둔다', () => {
    const draft = parseQuickInput('테스 이성웅', ctx)
    expect(draft.type).toBeNull()
    expect(draft.purpose).toBeNull()
  })

  it('목적 단어를 찾으면 해당 목적을 쓴다', () => {
    const draft = parseQuickInput('기술 미팅', ctx)
    expect(draft.purpose).toBe('tech')
    expect(draft.purposeFound).toBe(true)
  })

  it('목적이 없으면 첫 목적을 기본값으로 쓰고 표시한다', () => {
    const draft = parseQuickInput('미팅', ctx)
    expect(draft.purpose).toBe('intro')
    expect(draft.purposeFound).toBe(false)
  })

  it('유형 단어가 목적을 정하기도 한다', () => {
    expect(parseQuickInput('견적 전달', ctx).purpose).toBe('quote')
  })

  it('상태 단어를 읽는다', () => {
    const draft = parseQuickInput('어제 미팅 완료', ctx)
    expect(draft.status).toBe('done')
    expect(draft.statusFound).toBe(true)
    expect(parseQuickInput('내일 미팅 연기', ctx).status).toBe('postponed')
  })
})

describe('고객사와 담당자', () => {
  it('괄호 안 이름과 별칭으로 고객사를 찾는다', () => {
    expect(parseQuickInput('테스 미팅', ctx).companyId).toBe('co-tes')
    expect(parseQuickInput('Tes 미팅', ctx).companyId).toBe('co-tes')
    expect(parseQuickInput('유알커넥션 미팅', ctx).companyId).toBe('co-ur')
    expect(parseQuickInput('키자미테이블 전화', ctx).companyId).toBe('co-kiz')
  })

  it('조사가 붙어도 고객사를 찾는다', () => {
    expect(parseQuickInput('테스와 미팅', ctx).companyId).toBe('co-tes')
    expect(parseQuickInput('유알커넥션에 전화', ctx).companyId).toBe('co-ur')
  })

  it('띄어쓴 이름도 찾는다', () => {
    expect(parseQuickInput('A 제조기업 미팅', ctx).companyId).toBe('co-a')
  })

  it('이름이 비슷하지만 다른 고객사는 고르지 않는다', () => {
    expect(parseQuickInput('테스트 미팅', ctx).companyId).toBeNull()
  })

  it('담당자 이름과 직급을 함께 소비한다', () => {
    const draft = parseQuickInput('테스 이성웅 책임 미팅', ctx)
    expect(draft.companyId).toBe('co-tes')
    expect(draft.contactIds).toEqual(['ct-lee'])
    expect(draft.leftover).toEqual([])
  })

  it('고객사 없이 담당자 이름만 있으면 소속 고객사를 따라간다', () => {
    const draft = parseQuickInput('이성웅님 미팅', ctx)
    expect(draft.contactIds).toEqual(['ct-lee'])
    expect(draft.companyId).toBe('co-tes')
  })

  it('다른 고객사 담당자는 고르지 않는다', () => {
    const draft = parseQuickInput('테스 박지훈 미팅', ctx)
    expect(draft.contactIds).toEqual([])
    expect(draft.leftover).toEqual(['박지훈'])
  })

  it('같은 이름이 여러 고객사에 있으면 고르지 않고 알린다', () => {
    const draft = parseQuickInput('김민수 미팅', ctx)
    expect(draft.contactIds).toEqual([])
    expect(draft.ambiguousContacts).toEqual(['김민수'])
  })

  it('고객사를 말하면 같은 이름 담당자를 구분한다', () => {
    const draft = parseQuickInput('A 제조기업 김민수 미팅', ctx)
    expect(draft.contactIds).toEqual(['ct-kim-a'])
  })

  it('담당자 여러 명을 읽는다', () => {
    const draft = parseQuickInput('A 제조기업 김민수 박지훈 미팅', ctx)
    expect(draft.contactIds).toEqual(['ct-kim-a', 'ct-park'])
  })
})

describe('사업과 행사', () => {
  it('사업명 고유 단어로 사업을 찾고 고객사를 채운다', () => {
    const draft = parseQuickInput('KIJANIFY 미팅', ctx)
    expect(draft.businessId).toBe('biz-kij')
    expect(draft.companyId).toBe('co-kiz')
  })

  it('여러 사업에 공통인 일반 단어로는 찾지 않는다', () => {
    expect(parseQuickInput('구축 미팅', ctx).businessId).toBeNull()
  })

  it('행사명 고유 단어로 행사를 찾는다', () => {
    const draft = parseQuickInput('KOSA 행사 상담회', ctx)
    expect(draft.eventId).toBe('ev-kosa')
    expect(draft.type).toBe('event')
    expect(draft.purpose).toBe('consult')
  })
})

describe('제목과 메모', () => {
  it('고객사가 있으면 고객사와 목적으로 제목을 만든다', () => {
    const draft = parseQuickInput('테스 이성웅 10/30 14시 미팅 AX 제안', ctx)
    expect(draft.companyId).toBe('co-tes')
    expect(draft.type).toBe('meeting')
    expect(draft.startTime).toBe('14:00')
    expect(draft.leftover).toEqual(['AX', '제안'])
    expect(captureTitle(draft, '테스(Tes)')).toBe('테스(Tes) 최초 미팅')
    expect(captureNotes(draft, true)).toBe('AX 제안')
  })

  it('고객사가 없으면 남은 말로 내부 활동 제목을 만든다', () => {
    const draft = parseQuickInput('11/5 영업전략 회의', ctx)
    expect(draft.companyId).toBeNull()
    expect(captureTitle(draft)).toBe('영업전략 회의')
    expect(captureNotes(draft, false)).toBe('')
  })

  it('남은 말이 없는 내부 활동은 유형과 목적으로 제목을 만든다', () => {
    const draft = parseQuickInput('내일 10시 회의', ctx)
    expect(captureTitle(draft)).toBe('최초 미팅')
  })

  it('유형이 없으면 제목도 비운다', () => {
    expect(captureTitle(parseQuickInput('테스', ctx), '테스(Tes)')).toBe('')
  })
})
