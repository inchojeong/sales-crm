const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayKey() {
  return dateKey(new Date())
}

export function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(key: string, days: number) {
  const date = parseKey(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function addMonths(key: string, delta: number) {
  const date = parseKey(key)
  const day = date.getDate()
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1)
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, last))
  return dateKey(next)
}

export function monthCells(key: string) {
  const date = parseKey(key)
  const year = date.getFullYear()
  const month = date.getMonth()
  const startPad = new Date(year, month, 1).getDay()
  const count = new Date(year, month + 1, 0).getDate()
  const cells: Array<string | null> = []
  for (let index = 0; index < startPad; index += 1) cells.push(null)
  for (let day = 1; day <= count; day += 1) cells.push(dateKey(new Date(year, month, day)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function weekCells(key: string) {
  const date = parseKey(key)
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  return Array.from({ length: 7 }, (_, index) => addDays(dateKey(start), index))
}

export function formatMonthTitle(key: string) {
  const date = parseKey(key)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

export function formatDayTitle(key: string) {
  const date = parseKey(key)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export function formatFullDate(key: string) {
  const date = parseKey(key)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`
}

export function weekdayLabel(key: string) {
  return WEEKDAYS[parseKey(key).getDay()]
}

export function weekdayIndex(key: string) {
  return parseKey(key).getDay()
}

export const WEEKDAY_LABELS = WEEKDAYS

export function defaultStatus(date: string, today = todayKey()) {
  return date > today ? 'planned' : 'done'
}
