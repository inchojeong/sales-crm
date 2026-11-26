import { addDays, parseKey, plusHour, weekdayIndex } from './dates'
import { PURPOSES, autoTitle, purposeLabel } from './templates'
import type { ActivityStatus, ActivityType } from './types'

export interface CaptureContext {
  today: string
  nowTime?: string
  companies: { id: string; name: string }[]
  contacts: { id: string; companyId: string; name: string; position: string }[]
  businesses: { id: string; name: string; companyId: string | null }[]
  events: { id: string; name: string }[]
}

export interface CaptureDraft {
  date: string
  dateFound: boolean
  startTime: string | null
  endTime: string | null
  type: ActivityType | null
  typeWord: string
  purpose: string | null
  purposeFound: boolean
  companyId: string | null
  contactIds: string[]
  ambiguousContacts: string[]
  businessId: string | null
  eventId: string | null
  status: ActivityStatus
  statusFound: boolean
  leftover: string[]
}

const WEEKDAYS = '일월화수목금토'
const PARTICLE = /^(은|는|이|가|을|를|와|과|에|의|랑|님|측|에서|께|도|으로|로|과의|와의|쪽|씨)$/
const STOP_WORDS = new Set([
  '구축', '시스템', '플랫폼', '사업', '관리', '분석', '평가', '개발', '기반', '서비스', '지원', '데이터',
  '행사', '주최', '제조', 'day', '데이',
])

const TYPE_WORDS: { type: ActivityType; re: RegExp }[] = [
  { type: 'meeting', re: /미팅|회의|면담|만남/ },
  { type: 'email', re: /이메일|e-mail|email|메일/i },
  { type: 'call', re: /전화|통화/ },
  { type: 'proposal', re: /제안서|제안|견적/ },
  { type: 'event', re: /행사|세미나|컨퍼런스|전시회|상담회|네트워킹/ },
  { type: 'other', re: /방문|내부\s?검토|검토/ },
]

const PURPOSE_WORDS: Record<ActivityType, { id: string; re: RegExp }[]> = {
  meeting: [
    { id: 'intro', re: /최초|첫|소개/ },
    { id: 'tech', re: /기술/ },
    { id: 'requirements', re: /요구사항|요구/ },
    { id: 'business', re: /사업|논의/ },
  ],
  email: [
    { id: 'proposal_sent', re: /제안서/ },
    { id: 'materials', re: /자료/ },
    { id: 'reply', re: /회신|답장|답변/ },
    { id: 'followup', re: /후속/ },
  ],
  call: [
    { id: 'schedule', re: /일정/ },
    { id: 'progress', re: /진행/ },
    { id: 'request', re: /요청/ },
  ],
  proposal: [
    { id: 'quote', re: /견적/ },
    { id: 'solution', re: /솔루션|소개/ },
    { id: 'business', re: /사업/ },
    { id: 'partnership', re: /협력|제휴/ },
  ],
  event: [
    { id: 'expo', re: /전시/ },
    { id: 'conference', re: /컨퍼런스|세미나/ },
    { id: 'networking', re: /네트워킹/ },
    { id: 'consult', re: /상담/ },
  ],
  other: [
    { id: 'internal', re: /내부|검토/ },
    { id: 'visit', re: /방문/ },
    { id: 'support', re: /지원/ },
  ],
}

const STATUS_WORDS: Record<string, ActivityStatus> = { 완료: 'done', 예정: 'planned', 연기: 'postponed' }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function lastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function validDate(year: number, month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month)
}

function key(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function rollYear(year: number, month: number, day: number, today: string) {
  const candidate = key(year, month, day)
  const limit = addDays(today, -180)
  if (candidate < limit) return key(year + 1, month, day)
  return candidate
}

function takeFirst(rest: string, re: RegExp): { match: RegExpMatchArray | null; rest: string } {
  const match = rest.match(re)
  if (!match || match.index === undefined) return { match: null, rest }
  const next = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`
  return { match, rest: next }
}

function resolveDate(input: string, today: string) {
  const year = parseKey(today).getFullYear()
  let step = takeFirst(input, /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (step.match) {
    const [, y, m, d] = step.match
    if (validDate(Number(y), Number(m), Number(d))) return { date: key(Number(y), Number(m), Number(d)), rest: step.rest }
  }
  step = takeFirst(input, /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (step.match) {
    const [, y, m, d] = step.match
    const yy = y ? Number(y) : year
    if (validDate(yy, Number(m), Number(d))) {
      return { date: y ? key(yy, Number(m), Number(d)) : rollYear(yy, Number(m), Number(d), today), rest: step.rest }
    }
  }
  step = takeFirst(input, /그저께|어제|오늘|내일|모레|글피/)
  if (step.match) {
    const offsets: Record<string, number> = { 그저께: -2, 어제: -1, 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }
    return { date: addDays(today, offsets[step.match[0]]), rest: step.rest }
  }
  step = takeFirst(input, /(다다음\s?주|다음\s?주|이번\s?주|저번\s?주|지난\s?주)\s*([월화수목금토일])(?:요일|(?![가-힣]))/)
  if (step.match) {
    const label = step.match[1].replace(/\s/g, '')
    const offsets: Record<string, number> = { 다다음주: 14, 다음주: 7, 이번주: 0, 저번주: -7, 지난주: -7 }
    const weekStart = addDays(today, -weekdayIndex(today))
    return { date: addDays(weekStart, offsets[label] + WEEKDAYS.indexOf(step.match[2])), rest: step.rest }
  }
  step = takeFirst(input, /([월화수목금토일])요일/)
  if (step.match) {
    const target = WEEKDAYS.indexOf(step.match[1])
    const ahead = (target - weekdayIndex(today) + 7) % 7
    return { date: addDays(today, ahead), rest: step.rest }
  }
  step = takeFirst(input, /(?<![\d:])(\d{1,2})[/.](\d{1,2})(?![\d:])/)
  if (step.match) {
    const [, m, d] = step.match
    if (validDate(year, Number(m), Number(d))) return { date: rollYear(year, Number(m), Number(d), today), rest: step.rest }
  }
  step = takeFirst(input, /(?<!\d)(\d{1,2})\s*일(?![가-힣])/)
  if (step.match) {
    const month = parseKey(today).getMonth() + 1
    const day = Number(step.match[1])
    if (validDate(year, month, day)) return { date: key(year, month, day), rest: step.rest }
  }
  return { date: null, rest: input }
}

function to24(hour: number, meridiem?: string) {
  if (hour >= 13) return hour % 24
  if (meridiem === '오후') return hour < 12 ? hour + 12 : hour
  if (meridiem === '오전') return hour === 12 ? 0 : hour
  return hour >= 1 && hour <= 7 ? hour + 12 : hour
}

function clock(hour: number, minute: number) {
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null
  return `${pad(hour % 24)}:${pad(minute)}`
}

function minuteOf(match: string | undefined, half: string | undefined) {
  if (match) return Number(match)
  return half ? 30 : 0
}

function resolveTime(input: string) {
  let step = takeFirst(input, /(?<![\d.])(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})(?!\d)/)
  if (step.match) {
    const start = clock(Number(step.match[1]), Number(step.match[2]))
    const end = clock(Number(step.match[3]), Number(step.match[4]))
    if (start) return { start, end: end && end > start ? end : null, rest: step.rest }
  }
  step = takeFirst(input, /(?<![\d.])(\d{1,2}):(\d{2})(?!\d)/)
  if (step.match) {
    const start = clock(Number(step.match[1]), Number(step.match[2]))
    if (start) return { start, end: null, rest: step.rest }
  }
  step = takeFirst(
    input,
    /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?\s*[~\-–]\s*(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/,
  )
  if (step.match) {
    const m = step.match
    const start = clock(to24(Number(m[2]), m[1]), minuteOf(m[3], m[4]))
    const end = clock(to24(Number(m[6]), m[5] ?? m[1]), minuteOf(m[7], m[8]))
    if (start) return { start, end: end && end > start ? end : null, rest: step.rest }
  }
  step = takeFirst(input, /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/)
  if (step.match) {
    const m = step.match
    const start = clock(to24(Number(m[2]), m[1]), minuteOf(m[3], m[4]))
    if (start) return { start, end: null, rest: step.rest }
  }
  return { start: null as string | null, end: null as string | null, rest: input }
}

export function normalizeName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\(주\)|\(유\)|주식회사|유한회사/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function companyAliases(name: string) {
  const base = normalizeName(name)
  const aliases = new Set<string>([base])
  const stripped = base.replace(/\([^)]*\)/g, '')
  if (stripped) aliases.add(stripped)
  for (const inner of base.matchAll(/\(([^)]*)\)/g)) if (inner[1]) aliases.add(inner[1])
  return [...aliases].filter((alias) => alias.length >= 2)
}

function aliasMatches(candidate: string, alias: string, single: boolean) {
  if (candidate === alias) return true
  if (!single || !candidate.startsWith(alias)) return false
  return PARTICLE.test(candidate.slice(alias.length))
}

function stripParticle(token: string, target: string) {
  const value = normalizeName(token)
  if (value === target) return true
  return value.startsWith(target) && PARTICLE.test(value.slice(target.length))
}

function significantTokens(name: string) {
  return name
    .normalize('NFKC')
    .split(/[\s·,()[\]/]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function matchUnique(items: { id: string; name: string }[], tokens: string[], used: boolean[]) {
  const owners = new Map<string, Set<string>>()
  for (const item of items) {
    for (const token of significantTokens(item.name)) {
      const set = owners.get(token) ?? new Set<string>()
      set.add(item.id)
      owners.set(token, set)
    }
  }
  const hits = new Map<string, number>()
  const consumed: number[] = []
  tokens.forEach((raw, index) => {
    if (used[index]) return
    for (const [token, set] of owners) {
      if (set.size !== 1 || !stripParticle(raw, token)) continue
      const id = [...set][0]
      hits.set(id, (hits.get(id) ?? 0) + 1)
      consumed.push(index)
      break
    }
  })
  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null
  consumed.forEach((index) => {
    used[index] = true
  })
  return ranked[0][0]
}

export function parseQuickInput(text: string, ctx: CaptureContext): CaptureDraft {
  let rest = ` ${text.normalize('NFKC')} `

  const dated = resolveDate(rest, ctx.today)
  rest = dated.rest
  const timed = resolveTime(rest)
  rest = timed.rest

  let type: ActivityType | null = null
  let typeWord = ''
  let typeLength = 0
  let typeIndex = Infinity
  for (const entry of TYPE_WORDS) {
    const match = rest.match(entry.re)
    if (match && match.index !== undefined && match.index < typeIndex) {
      type = entry.type
      typeWord = match[0].replace(/\s+/g, ' ')
      typeLength = match[0].length
      typeIndex = match.index
    }
  }
  if (type) rest = `${rest.slice(0, typeIndex)} ${rest.slice(typeIndex + typeLength)}`

  let purpose: string | null = null
  let purposeFound = false
  if (type) {
    for (const entry of PURPOSE_WORDS[type]) {
      const inRest = rest.match(entry.re)
      if (inRest && inRest.index !== undefined) {
        purpose = entry.id
        purposeFound = true
        rest = `${rest.slice(0, inRest.index)} ${rest.slice(inRest.index + inRest[0].length)}`
        break
      }
      if (entry.re.test(typeWord)) {
        purpose = entry.id
        purposeFound = true
        break
      }
    }
    if (!purpose) purpose = PURPOSES[type][0].id
  }

  const tokens = rest.split(/\s+/).filter(Boolean)
  const used = tokens.map(() => false)

  let companyId: string | null = null
  let bestLength = 0
  let bestSpan: [number, number] | null = null
  let tied = false
  for (const company of ctx.companies) {
    const aliases = companyAliases(company.name)
    for (let start = 0; start < tokens.length; start += 1) {
      for (let length = 1; length <= 3 && start + length <= tokens.length; length += 1) {
        const candidate = normalizeName(tokens.slice(start, start + length).join(''))
        for (const alias of aliases) {
          if (!aliasMatches(candidate, alias, length === 1)) continue
          const score = alias.length * 10 + length
          if (score > bestLength) {
            bestLength = score
            companyId = company.id
            bestSpan = [start, length]
            tied = false
          } else if (score === bestLength && companyId !== company.id) {
            tied = true
          }
        }
      }
    }
  }
  if (tied) {
    companyId = null
    bestSpan = null
  }
  if (bestSpan) for (let i = 0; i < bestSpan[1]; i += 1) used[bestSpan[0] + i] = true

  const contactIds: string[] = []
  const ambiguousContacts: string[] = []
  const pool = companyId ? ctx.contacts.filter((contact) => contact.companyId === companyId) : ctx.contacts
  tokens.forEach((token, index) => {
    if (used[index]) return
    const matches = pool.filter((contact) => {
      const name = normalizeName(contact.name)
      return name.length >= 2 && stripParticle(token, name)
    })
    if (matches.length === 0) return
    const owners = new Set(matches.map((contact) => contact.companyId))
    if (owners.size > 1) {
      ambiguousContacts.push(token)
      return
    }
    for (const contact of matches) if (!contactIds.includes(contact.id)) contactIds.push(contact.id)
    used[index] = true
    const position = normalizeName(matches[0].position)
    if (position && tokens[index + 1] && normalizeName(tokens[index + 1]) === position) used[index + 1] = true
  })
  if (!companyId && contactIds.length > 0) {
    const owners = new Set(contactIds.map((id) => ctx.contacts.find((contact) => contact.id === id)?.companyId))
    if (owners.size === 1) companyId = [...owners][0] ?? null
  }

  const businessId = matchUnique(ctx.businesses, tokens, used)
  const eventId = matchUnique(ctx.events, tokens, used)
  if (!companyId && businessId) companyId = ctx.businesses.find((item) => item.id === businessId)?.companyId ?? null

  const date = dated.date ?? ctx.today
  let status: ActivityStatus = date > ctx.today ? 'planned' : 'done'
  if (date === ctx.today && timed.start && ctx.nowTime && timed.start > ctx.nowTime) status = 'planned'
  let statusFound = false
  tokens.forEach((token, index) => {
    if (used[index]) return
    const found = STATUS_WORDS[token]
    if (!found) return
    status = found
    statusFound = true
    used[index] = true
  })

  const leftover = tokens.filter((token, index) => !used[index] && !/^[-~–,./]+$/.test(token))

  return {
    date,
    dateFound: dated.date !== null,
    startTime: timed.start,
    endTime: timed.end,
    type,
    typeWord,
    purpose,
    purposeFound,
    companyId,
    contactIds,
    ambiguousContacts,
    businessId,
    eventId,
    status,
    statusFound,
    leftover,
  }
}

export function captureTitle(draft: Pick<CaptureDraft, 'type' | 'purpose' | 'typeWord' | 'leftover'>, companyName?: string) {
  if (!draft.type) return ''
  const label = draft.purpose ? purposeLabel(draft.type, draft.purpose) : ''
  if (companyName) return autoTitle({ type: draft.type, companyName, purposeLabel: label })
  const lead = draft.leftover.join(' ').trim()
  if (lead) return `${lead} ${draft.typeWord}`.trim()
  return autoTitle({ type: draft.type, purposeLabel: label })
}

export function captureNotes(draft: Pick<CaptureDraft, 'leftover'>, hasCompany: boolean) {
  return hasCompany ? draft.leftover.join(' ').trim() : ''
}

export function captureEnd(start: string | null, end: string | null) {
  if (!start) return null
  return end ?? plusHour(start)
}
