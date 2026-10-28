import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, defaultStatus, formatFullDate, todayKey } from '../dates'
import { useCrm } from '../store'
import { PURPOSES, STATUS_META, TYPE_META, TYPE_ORDER, autoTitle, purposeLabel } from '../templates'
import type { Activity, ActivityStatus, ActivityType, DialogRequest } from '../types'
import { useUI } from '../ui'

interface Draft {
  missing: boolean
  editingId?: string
  date: string
  type: ActivityType | null
  companyId: string | null
  contactIds: string[]
  purpose: string | null
  status: ActivityStatus
  statusTouched: boolean
  title: string
  titleTouched: boolean
  notes: string
  startTime: string
  endTime: string
  eventId: string | null
  newEventName: string
  relatedActivityId: string | null
  showMore: boolean
}

function plusHour(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  const total = hour * 60 + minute + 60
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function blank(date: string): Draft {
  return {
    missing: false,
    date,
    type: null,
    companyId: null,
    contactIds: [],
    purpose: null,
    status: defaultStatus(date) as ActivityStatus,
    statusTouched: false,
    title: '',
    titleTouched: false,
    notes: '',
    startTime: '',
    endTime: '',
    eventId: null,
    newEventName: '',
    relatedActivityId: null,
    showMore: false,
  }
}

function fromActivity(activity: Activity, mode: 'edit' | 'followup'): Draft {
  if (mode === 'followup') {
    const date = addDays(todayKey(), 1)
    return {
      missing: false,
      date,
      type: activity.type,
      companyId: activity.companyId,
      contactIds: [...activity.contactIds],
      purpose: activity.purpose,
      status: 'planned',
      statusTouched: true,
      title: activity.title,
      titleTouched: true,
      notes: '',
      startTime: activity.startTime ?? '',
      endTime: activity.endTime ?? '',
      eventId: activity.eventId,
      newEventName: '',
      relatedActivityId: activity.id,
      showMore: false,
    }
  }
  return {
    missing: false,
    editingId: activity.id,
    date: activity.date,
    type: activity.type,
    companyId: activity.companyId,
    contactIds: [...activity.contactIds],
    purpose: activity.purpose,
    status: activity.status,
    statusTouched: true,
    title: activity.title,
    titleTouched: true,
    notes: activity.notes,
    startTime: activity.startTime ?? '',
    endTime: activity.endTime ?? '',
    eventId: activity.eventId,
    newEventName: '',
    relatedActivityId: activity.relatedActivityId,
    showMore: false,
  }
}

function buildInitial(request: DialogRequest, activities: Activity[]): Draft {
  if (request.mode === 'create') {
    return {
      ...blank(request.date),
      type: request.type ?? null,
      companyId: request.companyId ?? null,
      contactIds: request.contactIds ? [...request.contactIds] : [],
      eventId: request.eventId ?? null,
      startTime: request.startTime ?? '',
      endTime: '',
    }
  }
  const activity = activities.find((item) => item.id === request.activityId)
  if (!activity) return { ...blank(todayKey()), missing: true }
  return fromActivity(activity, request.mode)
}

export function ActivityDialog({ request, onClose }: { request: DialogRequest; onClose: () => void }) {
  const { db, companyById, eventById, saveActivity, deleteActivity, currentUser } = useCrm()
  const { openEdit, openFollowup } = useUI()
  const [draft, setDraft] = useState<Draft>(() => buildInitial(request, db.activities))
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')
  const [dateOpen, setDateOpen] = useState(request.mode === 'followup')
  const [tried, setTried] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const companyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (companyOpen) setCompanyOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [companyOpen, onClose])

  useEffect(() => {
    if (!companyOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!companyRef.current?.contains(event.target as Node)) setCompanyOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [companyOpen])

  const company = draft.companyId ? companyById.get(draft.companyId) : undefined
  const generated = autoTitle({
    type: draft.type,
    companyName: company?.name,
    purposeLabel: draft.type && draft.purpose ? purposeLabel(draft.type, draft.purpose) : '',
  })
  const titleValue = draft.titleTouched ? draft.title : generated
  const employees = draft.companyId
    ? db.contacts
        .filter((contact) => contact.companyId === draft.companyId)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    : []
  const purposes = draft.type ? PURPOSES[draft.type] : []
  const author = draft.editingId
    ? db.activities.find((item) => item.id === draft.editingId)?.authorId === currentUser.id
      ? currentUser.name
      : '팀원'
    : currentUser.name
  const related = draft.relatedActivityId
    ? db.activities.find((item) => item.id === draft.relatedActivityId)
    : undefined
  const linkedEvent = draft.eventId ? eventById.get(draft.eventId) : undefined
  const followups = draft.editingId
    ? db.activities.filter((item) => item.relatedActivityId === draft.editingId)
    : []
  const relatedOptions = [...db.activities]
    .filter((item) => item.id !== draft.editingId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15)
  if (related && !relatedOptions.some((item) => item.id === related.id)) relatedOptions.unshift(related)

  const companies = [...db.companies]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .filter((item) => {
      const query = companyQuery.trim()
      if (!query) return true
      return `${item.name} ${item.industry}`.includes(query)
    })

  const blocker =
    !draft.type || !draft.purpose
      ? '활동 유형과 목적을 선택해 주세요.'
      : draft.type === 'event' && !draft.eventId && !draft.newEventName.trim()
        ? '행사명을 선택하거나 입력해 주세요.'
        : ''

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }))
    setTried(false)
  }

  function changeDate(date: string) {
    setDraft((current) => ({
      ...current,
      date,
      status: current.statusTouched ? current.status : (defaultStatus(date) as ActivityStatus),
    }))
    setTried(false)
  }

  function currentInput() {
    if (!draft.type || !draft.purpose) return null
    return {
      id: draft.editingId,
      date: draft.date,
      type: draft.type,
      title: (titleValue.trim() || generated || TYPE_META[draft.type].label).trim(),
      companyId: draft.companyId,
      contactIds: draft.contactIds,
      eventId: draft.newEventName.trim() ? null : draft.eventId,
      newEventName: draft.newEventName,
      purpose: draft.purpose,
      status: draft.status,
      notes: draft.notes,
      startTime: draft.startTime || null,
      endTime: draft.endTime || (draft.startTime ? plusHour(draft.startTime) : null),
      relatedActivityId: draft.relatedActivityId,
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = currentInput()
    if (!input || blocker) {
      setTried(true)
      return
    }
    saveActivity(input)
    onClose()
  }

  function beginFollowup() {
    if (!draft.editingId) return
    const input = currentInput()
    if (!input || blocker) {
      setTried(true)
      return
    }
    saveActivity(input)
    openFollowup(draft.editingId)
  }

  function remove() {
    if (!draft.editingId) return
    if (!window.confirm('이 영업활동을 삭제할까요? 캘린더와 이력에서 함께 삭제됩니다.')) return
    deleteActivity(draft.editingId)
    onClose()
  }

  if (draft.missing) {
    return (
      <div className="backdrop">
        <div className="modal small" role="dialog" aria-modal="true">
          <div className="modal-body">
            <p>영업활동을 찾을 수 없습니다.</p>
            <button type="button" className="btn primary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const eventFields = (
    <div>
      <span className="sec">행사</span>
      <select
        className="input"
        value={draft.eventId ?? ''}
        onChange={(event) => patch({ eventId: event.target.value || null, newEventName: '' })}
      >
        <option value="">행사 선택</option>
        {db.events
          .slice()
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
      </select>
      <label className="field event-new">
        <span className="field-label">신규 행사명</span>
        <input
          className="input"
          value={draft.newEventName}
          placeholder="예: AX Connect Day"
          onChange={(event) =>
            patch({ newEventName: event.target.value, eventId: event.target.value.trim() ? null : draft.eventId })
          }
        />
      </label>
    </div>
  )

  return (
    <div className="backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-dialog-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <header className="modal-head">
            <div>
              <h2 id="activity-dialog-title">{draft.editingId ? '영업활동 수정' : '영업활동 등록'}</h2>
              <p className="cal-sub">
                {formatFullDate(draft.date)} · 작성자 {author}
              </p>
            </div>
            <div className="head-side">
              <span className="badge">기록</span>
              <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
                ×
              </button>
            </div>
          </header>
          <div className="modal-body">
            {request.mode === 'followup' && related && (
              <div className="link-banner">
                {formatFullDate(related.date)} {related.title}의 후속 영업활동입니다. 기존 일정은 유지됩니다.
              </div>
            )}

            <span className="sec">활동 유형</span>
            <div className="type-grid">
              {TYPE_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="type-btn"
                  aria-pressed={draft.type === type}
                  onClick={() => patch({ type, purpose: draft.type === type ? draft.purpose : null })}
                >
                  {TYPE_META[type].label}
                </button>
              ))}
            </div>

            <div className="date-line">
              {dateOpen ? (
                <label className="field">
                  <span className="field-label">날짜</span>
                  <input className="input" type="date" value={draft.date} onChange={(event) => changeDate(event.target.value)} />
                </label>
              ) : (
                <button type="button" className="text-btn" onClick={() => setDateOpen(true)}>
                  날짜 변경
                </button>
              )}
              <div className="time-fields">
                <label className="field">
                  <span className="field-label">시작</span>
                  <input className="input" type="time" value={draft.startTime} onChange={(event) => patch({ startTime: event.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">종료</span>
                  <input className="input" type="time" value={draft.endTime} onChange={(event) => patch({ endTime: event.target.value })} />
                </label>
              </div>
            </div>
            <p className="hint">시간은 비워 둘 수 있습니다. 비워 두면 주간 캘린더에 종일 일정으로 표시됩니다.</p>

            {draft.type === 'event' && eventFields}

            <span className="sec">고객사</span>
            <div className="picker" ref={companyRef}>
              <button
                type="button"
                className="select-face"
                aria-expanded={companyOpen}
                onClick={() => setCompanyOpen((open) => !open)}
              >
                <span className={company ? '' : 'placeholder'}>
                  {company ? company.name : '고객사 선택 (미선택 시 내부 활동)'}
                </span>
                <Caret />
              </button>
              {companyOpen && (
                <div className="options">
                  <input
                    className="option-search"
                    autoFocus
                    placeholder="고객사 검색"
                    value={companyQuery}
                    onChange={(event) => setCompanyQuery(event.target.value)}
                  />
                  <button
                    type="button"
                    className={!draft.companyId ? 'option on' : 'option'}
                    onClick={() => {
                      patch({ companyId: null, contactIds: [] })
                      setCompanyOpen(false)
                    }}
                  >
                    내부 활동 (고객사 없음)
                  </button>
                  {companies.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === draft.companyId ? 'option on' : 'option'}
                      onClick={() => {
                        patch({
                          companyId: item.id,
                          contactIds: item.id === draft.companyId ? draft.contactIds : [],
                        })
                        setCompanyOpen(false)
                        setCompanyQuery('')
                      }}
                    >
                      {item.name}
                      {item.industry ? ` · ${item.industry}` : ''}
                    </button>
                  ))}
                  {companies.length === 0 && <p className="empty option-empty">해당하는 고객사가 없습니다.</p>}
                </div>
              )}
            </div>

            {draft.companyId && (
              <>
                <span className="sec">담당자</span>
                {employees.length === 0 ? (
                  <p className="hint">등록된 담당자가 없습니다. 담당자 없이도 저장할 수 있습니다.</p>
                ) : (
                  <div>
                    {employees.map((contact) => {
                      const checked = draft.contactIds.includes(contact.id)
                      const detail = [contact.position, contact.department].filter(Boolean).join(' · ')
                      return (
                        <label key={contact.id} className={checked ? 'check on' : 'check'}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              patch({
                                contactIds: checked
                                  ? draft.contactIds.filter((id) => id !== contact.id)
                                  : [...draft.contactIds, contact.id],
                              })
                            }
                          />
                          <span className="mark" aria-hidden="true" />
                          <span>
                            {contact.name}
                            {detail ? ` ${detail}` : ''}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            <span className="sec">활동 목적</span>
            {purposes.length === 0 ? (
              <p className="hint">활동 유형을 선택하면 목적을 고를 수 있습니다.</p>
            ) : (
              <div>
                {purposes.map((purpose) => {
                  const checked = draft.purpose === purpose.id
                  return (
                    <label key={purpose.id} className={checked ? 'choice on' : 'choice'}>
                      <input
                        type="radio"
                        name="purpose"
                        checked={checked}
                        onChange={() => patch({ purpose: purpose.id })}
                      />
                      <span className="mark" aria-hidden="true" />
                      <span>{purpose.label}</span>
                    </label>
                  )
                })}
              </div>
            )}

            <span className="sec">진행 상태</span>
            <div className="segment status" role="group" aria-label="진행 상태">
              {(Object.keys(STATUS_META) as ActivityStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={draft.status === status ? 'on' : ''}
                  aria-pressed={draft.status === status}
                  onClick={() => patch({ status, statusTouched: true })}
                >
                  {STATUS_META[status].label}
                </button>
              ))}
            </div>
            {draft.status === 'postponed' ? (
              <p className="hint">기존 날짜는 연기로 유지됩니다. 변경된 일정은 새 영업활동으로 등록합니다.</p>
            ) : !draft.statusTouched ? (
              <p className="hint">오늘 이전은 완료, 이후 날짜는 예정으로 설정됩니다.</p>
            ) : null}

            {draft.editingId && (
              <button type="button" className="text-btn follow-btn" onClick={beginFollowup}>
                {draft.status === 'postponed' ? '일정 재등록' : '후속 영업활동 등록'}
              </button>
            )}

            {request.mode !== 'followup' && related && (
              <button type="button" className="text-btn follow-btn" onClick={() => openEdit(related.id)}>
                이전 영업활동 · {formatFullDate(related.date)} {related.title}
              </button>
            )}
            {linkedEvent && draft.type !== 'event' && <p className="hint">연결된 행사 · {linkedEvent.name}</p>}
            {followups.length > 0 && (
              <div className="links">
                <span className="hint">후속 영업활동</span>
                {followups.map((item) => (
                  <button key={item.id} type="button" className="text-btn" onClick={() => openEdit(item.id)}>
                    {formatFullDate(item.date)} · {item.title}
                  </button>
                ))}
              </div>
            )}

            <div className="label-row">
              <span className="sec">활동 제목</span>
              {draft.titleTouched && (
                <button type="button" className="text-btn" onClick={() => patch({ titleTouched: false, title: '' })}>
                  제목 자동 입력
                </button>
              )}
            </div>
            <input
              className="input"
              value={titleValue}
              placeholder="고객사와 목적을 선택하면 자동 입력됩니다"
              onChange={(event) => patch({ title: event.target.value, titleTouched: true })}
            />
            {!draft.titleTouched && <p className="hint">캘린더에 표시되는 제목입니다. 직접 수정할 수 있습니다.</p>}

            <span className="sec">활동 내용</span>
            <textarea
              className="textarea"
              value={draft.notes}
              placeholder={draft.type ? TYPE_META[draft.type].placeholder : '협의 내용과 후속 조치를 입력합니다.'}
              onChange={(event) => patch({ notes: event.target.value })}
            />

            <button
              type="button"
              className="text-btn more-toggle"
              onClick={() => patch({ showMore: !draft.showMore })}
            >
              {draft.showMore ? '연결 정보 닫기' : '행사·이전 영업활동 연결'}
            </button>
            {draft.showMore && (
              <div className="more-box">
                {draft.type !== 'event' && eventFields}
                <span className="sec">이전 영업활동</span>
                <select
                  className="input"
                  value={draft.relatedActivityId ?? ''}
                  onChange={(event) => patch({ relatedActivityId: event.target.value || null })}
                >
                  <option value="">연결 없음</option>
                  {relatedOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatFullDate(item.date)} · {item.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <footer className="modal-foot">
            {blocker && (
              <p className={tried ? 'error' : 'hint'} role={tried ? 'alert' : undefined}>
                {blocker}
              </p>
            )}
            <button type="submit" className="btn primary wide">
              저장
            </button>
            {draft.editingId && (
              <button type="button" className="text-btn danger foot-delete" onClick={remove}>
                영업활동 삭제
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  )
}

function Caret() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
