import { useMemo, useState } from 'react'
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  formatDayTitle,
  formatFullDate,
  formatMonthTitle,
  monthCells,
  todayKey,
  weekCells,
  weekdayIndex,
  weekdayLabel,
} from '../dates'
import { isEventAttendance } from '../attendance'
import { useDirectory } from '../directory'
import { TYPE_META, TYPE_ORDER } from '../templates'
import type { Activity, ActivityType, SalesEvent } from '../types'
import { useCrm } from '../store'
import { useUI } from '../ui'
import { ActivityRow } from './ActivityRow'

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17]
const HOUR_PX = 96
const DAY_START = 9 * 60
const DAY_END = 18 * 60

const CARD_TONE: Record<ActivityType, { bg: string; fg: string }> = {
  meeting: { bg: '#ece8ff', fg: '#3d348b' },
  email: { bg: '#e7f8ee', fg: '#14643a' },
  proposal: { bg: '#e5f3ff', fg: '#1d4f91' },
  call: { bg: '#fff4d8', fg: '#8a5a12' },
  event: { bg: '#ffe8f0', fg: '#9d2458' },
  other: { bg: '#eef1f6', fg: '#3e4654' },
}

function minutesOf(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatClock(value: string) {
  return value.slice(0, 5)
}

interface DayPlan {
  events: SalesEvent[]
  activities: Activity[]
}

function emptyDay(): DayPlan {
  return { events: [], activities: [] }
}

function eventDays(event: SalesEvent) {
  const start = event.startDate
  const end = !event.endDate || event.endDate < start ? start : event.endDate
  if (!start) return []
  const dates: string[] = []
  let cursor = start
  let guard = 0
  while (cursor <= end && guard < 62) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return dates
}

export function CalendarScreen() {
  const { db, companyById } = useCrm()
  const directory = useDirectory()
  const { openCreate, openEdit, go } = useUI()
  const today = todayKey()
  const [selected, setSelected] = useState(today)
  const [mode, setMode] = useState<'month' | 'week'>('week')
  const [needle, setNeedle] = useState('')
  const [typeFilter, setTypeFilter] = useState<ActivityType | ''>('')

  const byDate = useMemo(() => {
    const query = needle.trim()
    const map = new Map<string, DayPlan>()
    const ensure = (date: string) => {
      const current = map.get(date)
      if (current) return current
      const created = emptyDay()
      map.set(date, created)
      return created
    }
    const showEvents = !typeFilter || typeFilter === 'event'
    if (showEvents) {
      for (const event of db.events) {
        const attendance = db.activities.filter((activity) => isEventAttendance(activity) && activity.eventId === event.id)
        const haystack = [event.name, event.place, event.memo, ...attendance.map((activity) => `${activity.title} ${activity.notes} ${activity.opinion}`)].join(' ')
        if (query && !haystack.includes(query)) continue
        for (const date of eventDays(event)) ensure(date).events.push(event)
      }
    }
    for (const activity of db.activities) {
      if (isEventAttendance(activity)) continue
      if (typeFilter && activity.type !== typeFilter) continue
      const company = activity.companyId
        ? directory.companyById.get(activity.companyId)?.name ?? companyById.get(activity.companyId)?.name
        : ''
      if (query && !`${activity.title} ${company ?? ''} ${activity.notes} ${activity.opinion}`.includes(query)) continue
      ensure(activity.date).activities.push(activity)
    }
    for (const plan of map.values()) {
      plan.activities.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') || a.createdAt.localeCompare(b.createdAt))
    }
    return map
  }, [db.activities, db.events, companyById, directory.companyById, needle, typeFilter])

  const cells = monthCells(selected)
  const selectedPlan = byDate.get(selected) ?? emptyDay()
  const weekDays = weekCells(selected)
  const thisWeek = new Set(weekCells(today))
  const visibleDays = [...byDate.values()]
  const visible = visibleDays.flatMap((plan) => plan.activities)
  const stats = [
    { label: '오늘', value: (byDate.get(today)?.events.length ?? 0) + visible.filter((item) => item.date === today).length },
    {
      label: '이번 주',
      value:
        [...thisWeek].reduce((sum, date) => sum + (byDate.get(date)?.events.length ?? 0), 0) +
        visible.filter((item) => thisWeek.has(item.date)).length,
    },
    { label: '예정', value: visible.filter((item) => item.status === 'planned').length },
    { label: '완료', value: visible.filter((item) => item.status === 'done').length },
    { label: '연기', value: visible.filter((item) => item.status === 'postponed').length },
  ]
  const rangeLabel =
    mode === 'month' ? formatMonthTitle(selected) : `${formatDayTitle(weekDays[0])} – ${formatDayTitle(weekDays[6])}`

  function shift(delta: number) {
    setSelected(mode === 'month' ? addMonths(selected, delta) : addDays(selected, delta * 7))
  }

  return (
    <section className="cal-screen">
      <div className="cal-title-row">
        <h1>캘린더</h1>
        <div className="cal-actions">
          <button type="button" className="pill" onClick={() => setSelected(today)}>
            오늘
          </button>
          <div className="segment" role="group" aria-label="캘린더 보기">
            <button type="button" className={mode === 'month' ? 'on' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
              월간
            </button>
            <button type="button" className={mode === 'week' ? 'on' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
              주간
            </button>
          </div>
          <span className="range-pill">{rangeLabel}</span>
          <button type="button" className="btn primary" onClick={() => openCreate({ date: selected })}>
            + 영업활동 등록
          </button>
        </div>
      </div>

      <div className="dash-stats" aria-label="영업활동 요약">
        {stats.map((item) => (
          <div key={item.label} className="dash-stat">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="cal-nav-row">
        <div className="month-line">
          <button type="button" className="icon-btn" aria-label={mode === 'month' ? '이전 달' : '이전 주'} onClick={() => shift(-1)}>
            ‹
          </button>
          <strong>{formatMonthTitle(selected)}</strong>
          <button type="button" className="icon-btn" aria-label={mode === 'month' ? '다음 달' : '다음 주'} onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="cal-filters">
          <input
            className="filter-search"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="영업활동 검색"
            aria-label="캘린더 검색"
          />
          <select
            className="filter-select"
            aria-label="활동 유형"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ActivityType | '')}
          >
            <option value="">전체 유형</option>
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {TYPE_META[type].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === 'month' ? (
        <>
          <div className="dows">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className={label === '일' ? 'dow sun' : 'dow'}>
                {label}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="day empty" />
              const plan = byDate.get(date) ?? emptyDay()
              const marks = plan.events.length + plan.activities.length
              const className = ['day', date === selected ? 'selected' : '', date === today ? 'today' : '']
                .filter(Boolean)
                .join(' ')
              return (
                <div
                  key={date}
                  className={className}
                  onClick={() => setSelected(date)}
                >
                  <button
                    type="button"
                    className="day-num"
                    aria-pressed={date === selected}
                    aria-label={`${formatFullDate(date)}, 일정 ${marks}건`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelected(date)
                    }}
                  >
                    {Number(date.slice(-2))}
                  </button>
                  <span className="month-pills">
                    {plan.events.slice(0, 3).map((eventItem) => (
                      <button
                        key={eventItem.id}
                        type="button"
                        className="month-pill"
                        style={{ background: CARD_TONE.event.bg, color: CARD_TONE.event.fg }}
                        onClick={(click) => {
                          click.stopPropagation()
                          setSelected(date)
                          go({ name: 'event', id: eventItem.id })
                        }}
                      >
                        {eventItem.name}
                      </button>
                    ))}
                    {plan.activities.slice(0, Math.max(0, 3 - plan.events.length)).map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        className="month-pill"
                        style={{ background: CARD_TONE[activity.type].bg, color: CARD_TONE[activity.type].fg }}
                        onClick={(click) => {
                          click.stopPropagation()
                          setSelected(date)
                          openEdit(activity.id)
                        }}
                      >
                        {activity.startTime ? `${formatClock(activity.startTime)} ${activity.title}` : activity.title}
                      </button>
                    ))}
                    {marks > 3 && <span className="month-more">+{marks - 3}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <WeekBoard
          days={weekDays}
          today={today}
          selected={selected}
          byDate={byDate}
          onSelect={setSelected}
          onOpen={(id, date) => {
            setSelected(date)
            openEdit(id)
          }}
          onOpenEvent={(id, date) => {
            setSelected(date)
            go({ name: 'event', id })
          }}
          onCreate={(date, startTime) => {
            setSelected(date)
            openCreate({ date, startTime })
          }}
        />
      )}

      <div className="legend">
        {TYPE_ORDER.map((type) => (
          <span key={type}>
            <i className="swatch" style={{ background: CARD_TONE[type].bg, boxShadow: `inset 0 0 0 1px ${CARD_TONE[type].fg}22` }} />
            {TYPE_META[type].label}
          </span>
        ))}
      </div>

      <div className="day-panel">
        <div className="day-panel-head">
          <h2>
            {formatDayTitle(selected)} 영업활동
            <span className="count">{selectedPlan.events.length + selectedPlan.activities.length}</span>
            {selected === today && <span className="today-pill">오늘</span>}
          </h2>
        </div>
        {selectedPlan.events.length + selectedPlan.activities.length === 0 ? (
          <p className="empty">등록된 일정이 없습니다.</p>
        ) : (
          <div className="rows">
            {selectedPlan.events.map((eventItem) => (
              <button key={eventItem.id} type="button" className="arow" onClick={() => go({ name: 'event', id: eventItem.id })}>
                <span className="aicon" aria-hidden="true">
                  {eventItem.name.slice(0, 1)}
                </span>
                <span className="arow-body">
                  <span className="arow-title">{eventItem.name}</span>
                  <span className="arow-meta">{['행사', eventItem.place].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tag">행사</span>
              </button>
            ))}
            {selectedPlan.activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function WeekBoard({
  days,
  today,
  selected,
  byDate,
  onSelect,
  onOpen,
  onOpenEvent,
  onCreate,
}: {
  days: string[]
  today: string
  selected: string
  byDate: Map<string, DayPlan>
  onSelect: (date: string) => void
  onOpen: (id: string, date: string) => void
  onOpenEvent: (id: string, date: string) => void
  onCreate: (date: string, startTime: string) => void
}) {
  return (
    <div className="time-board">
      <div className="time-head">
        <div className="time-corner" />
        <div className="time-dates">
          {days.map((date) => {
            const sunday = weekdayIndex(date) === 0
            return (
              <button key={date} type="button" className={date === selected ? 'time-date on' : 'time-date'} onClick={() => onSelect(date)}>
                <span className={sunday ? 'wlabel sun' : 'wlabel'}>{weekdayLabel(date)}</span>
                <strong className={date === today ? 'date-bubble today' : 'date-bubble'}>{Number(date.slice(-2))}</strong>
              </button>
            )
          })}
        </div>
      </div>
      <div className="time-scroll">
        <div className="time-gutter" aria-hidden="true">
          {HOURS.map((hour) => (
            <div key={hour} className="time-label">
              {hour}:00
            </div>
          ))}
        </div>
        <div className="time-cols">
          {days.map((date) => {
            const plan = byDate.get(date) ?? emptyDay()
            const untimed = plan.activities.filter((item) => !item.startTime)
            const timed = plan.activities.filter((item) => item.startTime)
            return (
              <div key={date} className={['time-col', date === selected ? 'selected' : '', date === today ? 'today' : ''].filter(Boolean).join(' ')}>
                {(plan.events.length > 0 || untimed.length > 0) && (
                  <div className="untimed">
                    {plan.events.map((eventItem) => (
                      <button
                        key={eventItem.id}
                        type="button"
                        className="event-card compact"
                        style={{ background: CARD_TONE.event.bg, color: CARD_TONE.event.fg }}
                        onClick={() => onOpenEvent(eventItem.id, date)}
                      >
                        {eventItem.name}
                      </button>
                    ))}
                    {untimed.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        className="event-card compact"
                        style={{ background: CARD_TONE[activity.type].bg, color: CARD_TONE[activity.type].fg }}
                        onClick={() => onOpen(activity.id, date)}
                      >
                        {activity.status === 'postponed' ? `연기 · ${activity.title}` : activity.title}
                      </button>
                    ))}
                  </div>
                )}
                <div className="time-slots" style={{ height: HOURS.length * HOUR_PX }}>
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className="slot"
                      aria-label={`${formatFullDate(date)} ${hour}시 영업활동 등록`}
                      onClick={() => onCreate(date, `${String(hour).padStart(2, '0')}:00`)}
                    />
                  ))}
                  {timed.map((activity) => {
                    const start = minutesOf(activity.startTime!)
                    const end = activity.endTime ? minutesOf(activity.endTime) : start + 60
                    const top = ((Math.max(start, DAY_START) - DAY_START) / 60) * HOUR_PX
                    const height = Math.max(((Math.min(end, DAY_END) - Math.max(start, DAY_START)) / 60) * HOUR_PX - 6, 42)
                    if (end <= DAY_START || start >= DAY_END) return null
                    return (
                      <button
                        key={activity.id}
                        type="button"
                        className="event-card"
                        style={{
                          top,
                          height,
                          background: CARD_TONE[activity.type].bg,
                          color: CARD_TONE[activity.type].fg,
                        }}
                        onClick={() => onOpen(activity.id, date)}
                      >
                        <strong>{activity.status === 'postponed' ? `연기 · ${activity.title}` : activity.title}</strong>
                        <span>
                          {formatClock(activity.startTime!)}
                          {activity.endTime ? ` – ${formatClock(activity.endTime)}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
