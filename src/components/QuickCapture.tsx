import { useEffect, useMemo, useRef, useState } from 'react'
import { useBusiness } from '../business'
import { formatFullDate, todayKey } from '../dates'
import {
  captureEnd,
  captureNotes,
  captureTitle,
  parseQuickInput,
  type CaptureContext,
} from '../quickCapture'
import { useRecordSource } from '../records'
import { lastContactIds } from '../smart'
import { useCrm } from '../store'
import { PURPOSES, STATUS_META, TYPE_META, TYPE_ORDER, purposeLabel } from '../templates'
import type { ActivityStatus, ActivityType } from '../types'

const EXAMPLES = [
  '테스 이성웅 내일 14시 미팅',
  '다음주 화요일 10:00-11:30 유알커넥션 기술 미팅',
  '10/30 영업전략 회의',
]

const STATUS_ORDER: ActivityStatus[] = ['planned', 'done', 'postponed']
const NAME_LIKE = /^[가-힣A-Za-z0-9&·()㈜.\-]{2,20}$/
const PERSON_LIKE = /^[가-힣]{2,4}$/

function nowTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const { db, saveActivity } = useCrm()
  const records = useRecordSource()
  const portfolio = useBusiness()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [typeChoice, setTypeChoice] = useState<ActivityType | null>(null)
  const [statusChoice, setStatusChoice] = useState<ActivityStatus | null>(null)
  const [eventChoice, setEventChoice] = useState('')
  const [titleChoice, setTitleChoice] = useState<string | null>(null)
  const [dateChoice, setDateChoice] = useState<string | null>(null)
  const [startChoice, setStartChoice] = useState<string | null>(null)
  const [endChoice, setEndChoice] = useState<string | null>(null)
  const [extraContacts, setExtraContacts] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const ctx = useMemo<CaptureContext>(
    () => ({
      today: todayKey(),
      nowTime: nowTime(),
      companies: records.companies.map((item) => ({ id: item.id, name: item.name })),
      contacts: records.contacts.map((item) => ({
        id: item.id,
        companyId: item.companyId,
        name: item.name,
        position: item.position,
      })),
      businesses: portfolio.businesses.map((item) => ({ id: item.id, name: item.name, companyId: item.companyId })),
      events: db.events.map((item) => ({ id: item.id, name: item.name })),
    }),
    [records.companies, records.contacts, portfolio.businesses, db.events],
  )

  const parsed = useMemo(() => parseQuickInput(text, ctx), [text, ctx])

  const company = parsed.companyId ? records.companies.find((item) => item.id === parsed.companyId) : undefined
  const type = typeChoice ?? parsed.type
  const purpose = typeChoice && typeChoice !== parsed.type ? PURPOSES[typeChoice][0].id : parsed.purpose ?? (type ? PURPOSES[type][0].id : null)
  const suggested = useMemo(() => {
    if (!parsed.companyId || parsed.contactIds.length > 0) return []
    const owned = new Set(records.contacts.filter((item) => item.companyId === parsed.companyId).map((item) => item.id))
    return lastContactIds(parsed.companyId, db.activities, owned)
  }, [parsed.companyId, parsed.contactIds, records.contacts, db.activities])
  const contactIds = [...parsed.contactIds, ...extraContacts.filter((id) => !parsed.contactIds.includes(id))]
  const contactNames = contactIds
    .map((id) => records.contacts.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const eventId = eventChoice || parsed.eventId || ''
  const business = parsed.businessId ? portfolio.businesses.find((item) => item.id === parsed.businessId) : undefined
  const date = dateChoice ?? parsed.date
  const startTime = startChoice ?? parsed.startTime ?? ''
  const endTime = endChoice ?? parsed.endTime ?? ''
  const status = statusChoice ?? parsed.status

  const titleSource = {
    type,
    purpose,
    typeWord: parsed.typeWord || (type ? TYPE_META[type].label : ''),
    leftover: parsed.leftover,
  }
  const autoValue = captureTitle(titleSource, company?.name)
  const title = titleChoice ?? autoValue
  const notes = captureNotes(parsed, Boolean(company))

  // 고객사나 담당자 이름은 보통 문장 앞쪽에 오므로 첫 단어만 새로 등록할 후보로 제안합니다.
  const unknown = parsed.leftover.slice(0, 1).filter((token) => NAME_LIKE.test(token) && !/^\d+$/.test(token))

  function resetChoices() {
    setTypeChoice(null)
    setStatusChoice(null)
    setEventChoice('')
    setTitleChoice(null)
    setDateChoice(null)
    setStartChoice(null)
    setEndChoice(null)
    setExtraContacts([])
  }

  function change(value: string) {
    setText(value)
    resetChoices()
    setMessage('')
  }

  async function register(kind: 'company' | 'contact', token: string) {
    setBusy(true)
    setMessage('')
    try {
      if (kind === 'company') {
        await records.saveCompany({ name: token, industry: '', website: '', phone: '', address: '', summary: '' })
      } else if (parsed.companyId) {
        await records.saveContact({
          companyId: parsed.companyId,
          name: token,
          department: '',
          position: '',
          email: '',
          phone: '',
          memo: '',
        })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '등록하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function save() {
    if (!text.trim()) return
    if (!type || !purpose) {
      setMessage('활동 유형을 선택해 주세요.')
      return
    }
    if (type === 'event' && !eventId) {
      setMessage('행사를 선택해 주세요.')
      return
    }
    const label = title.trim() || TYPE_META[type].label
    saveActivity({
      date,
      type,
      title: label,
      companyId: company?.id ?? null,
      contactIds: company ? contactIds : [],
      eventId: eventId || null,
      businessId: parsed.businessId,
      purpose,
      status,
      notes,
      opinion: '',
      startTime: startTime || null,
      endTime: captureEnd(startTime || null, endTime || null),
      relatedActivityId: null,
    })
    setSaved((list) => [`${label} · ${formatFullDate(date)}${startTime ? ` ${startTime}` : ''}`, ...list].slice(0, 3))
    setText('')
    resetChoices()
    setMessage('')
    inputRef.current?.focus()
  }

  return (
    <div className="backdrop quick-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal quick-panel" role="dialog" aria-modal="true" aria-label="빠른 입력">
        <div className="quick-top">
          <input
            ref={inputRef}
            className="quick-input"
            value={text}
            placeholder="예: 테스 이성웅 10/30 14시 미팅"
            aria-label="빠른 입력"
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                save()
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
          />
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>

        {!text.trim() && (
          <div className="quick-help">
            <p>날짜, 시간, 유형, 고객사, 담당자, 사업 이름을 문장처럼 이어서 입력하면 아래에 정리됩니다. Enter로 저장합니다.</p>
            <div className="quick-examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="quick-example" onClick={() => change(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {text.trim() && (
          <div className="quick-card">
            <label className="field">
              <span className="field-label">제목</span>
              <input
                className="input"
                value={title}
                placeholder="유형을 고르면 제목이 만들어집니다"
                onChange={(event) => setTitleChoice(event.target.value)}
              />
            </label>

            <div className="quick-row">
              <label className="field">
                <span className="field-label">날짜{parsed.dateFound ? '' : ' (오늘)'}</span>
                <input className="input" type="date" value={date} onChange={(event) => setDateChoice(event.target.value || parsed.date)} />
              </label>
              <label className="field">
                <span className="field-label">시작</span>
                <input className="input" type="time" value={startTime} onChange={(event) => setStartChoice(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">종료</span>
                <input className="input" type="time" value={endTime} onChange={(event) => setEndChoice(event.target.value)} />
              </label>
            </div>

            <div>
              <span className="field-label">유형</span>
              <div className="quick-choices">
                {TYPE_ORDER.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="quick-choice"
                    aria-pressed={type === item}
                    onClick={() => setTypeChoice(item)}
                  >
                    {TYPE_META[item].label}
                  </button>
                ))}
              </div>
              {type && purpose && (
                <p className="quick-note">
                  목적 {purposeLabel(type, purpose)}
                  {parsed.type === type && !parsed.purposeFound ? ' (기본값)' : ''}
                </p>
              )}
            </div>

            <div>
              <span className="field-label">상태</span>
              <div className="quick-choices">
                {STATUS_ORDER.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="quick-choice"
                    aria-pressed={status === item}
                    onClick={() => setStatusChoice(item)}
                  >
                    {STATUS_META[item].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="quick-links">
              <div>
                <span className="field-label">고객사</span>
                <p className={company ? 'quick-value' : 'quick-value empty'}>{company ? company.name : '내부 활동 (고객사 없음)'}</p>
              </div>
              {company && (
                <div>
                  <span className="field-label">담당자</span>
                  <p className={contactNames.length ? 'quick-value' : 'quick-value empty'}>
                    {contactNames.length ? contactNames.map((item) => `${item.name}${item.position ? ` ${item.position}` : ''}`).join(', ') : '지정 안 함'}
                  </p>
                </div>
              )}
              {business && (
                <div>
                  <span className="field-label">관련 사업</span>
                  <p className="quick-value">{business.name}</p>
                </div>
              )}
            </div>

            {type === 'event' && (
              <label className="field">
                <span className="field-label">행사</span>
                <select className="input" value={eventId} onChange={(event) => setEventChoice(event.target.value)}>
                  <option value="">행사 선택</option>
                  {db.events
                    .slice()
                    .sort((a, b) => b.startDate.localeCompare(a.startDate))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {notes && <p className="quick-note">메모로 저장: {notes}</p>}

            {(suggested.length > 0 || unknown.length > 0 || parsed.ambiguousContacts.length > 0) && (
              <div className="quick-suggest">
                {suggested.length > 0 && extraContacts.length === 0 && (
                  <button type="button" className="quick-example" onClick={() => setExtraContacts(suggested)}>
                    직전 담당자{' '}
                    {suggested
                      .map((id) => records.contacts.find((item) => item.id === id)?.name)
                      .filter(Boolean)
                      .join(', ')}{' '}
                    추가
                  </button>
                )}
                {unknown.map((token) => (
                  <span key={token} className="quick-register">
                    {!company && (
                      <button type="button" className="quick-example" disabled={busy} onClick={() => void register('company', token)}>
                        ‘{token}’ 새 고객사로 등록
                      </button>
                    )}
                    {company && PERSON_LIKE.test(token) && (
                      <button type="button" className="quick-example" disabled={busy} onClick={() => void register('contact', token)}>
                        ‘{token}’ {company.name} 담당자로 등록
                      </button>
                    )}
                  </span>
                ))}
                {parsed.ambiguousContacts.length > 0 && (
                  <p className="quick-note">
                    {parsed.ambiguousContacts.join(', ')} 이름의 담당자가 여러 고객사에 있습니다. 고객사 이름을 함께 입력해 주세요.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {message && <p className="error quick-error">{message}</p>}

        <div className="quick-foot">
          <div className="quick-saved">
            {saved.map((item, index) => (
              <span key={`${item}-${index}`}>저장함 · {item}</span>
            ))}
          </div>
          <div className="foot-bar">
            <button type="button" className="btn ghost" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="btn primary" disabled={!text.trim() || busy} onClick={save}>
              저장 (Enter)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
