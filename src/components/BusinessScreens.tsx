import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { RelationTimeline } from './ActivityRow'
import {
  BUSINESS_STATUSES,
  BUSINESS_TYPES,
  MILESTONE_KINDS,
  MILESTONE_STATUSES,
  businessStatusLabel,
  businessTypeLabel,
  milestoneKindLabel,
  milestoneStatusLabel,
  useBusiness,
  type BusinessInput,
  type BusinessRecord,
  type BusinessStatus,
  type BusinessType,
  type Milestone,
  type MilestoneInput,
  type MilestoneKind,
  type MilestoneStatus,
} from '../business'
import { WEEKDAY_LABELS, addMonths, formatMonthTitle, monthCells, todayKey } from '../dates'
import { useDirectory } from '../directory'
import { useCrm } from '../store'
import type { Contact } from '../types'
import { useUI } from '../ui'

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function shortDate(key: string) {
  return key.replaceAll('-', '.')
}

function nextPlan(items: Milestone[]) {
  const today = todayKey()
  const open = items
    .filter((item) => item.status !== 'done' && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'))
  return open.find((item) => item.kind === 'milestone') ?? open[0] ?? null
}

function contactLine(contact: Contact, companyName?: string) {
  return [contact.name, contact.position, companyName].filter(Boolean).join(' · ')
}

function blankBusiness(): BusinessInput {
  const today = todayKey()
  return {
    name: '',
    overview: '',
    type: 'b2b',
    status: 'preparing',
    startDate: today,
    endDate: today,
    companyId: '',
    targetContactIds: [],
    stakeholderIds: [],
  }
}

function toInput(record: BusinessRecord): BusinessInput {
  return {
    id: record.id,
    name: record.name,
    overview: record.overview,
    type: record.type,
    status: record.status,
    startDate: record.startDate,
    endDate: record.endDate,
    companyId: record.companyId,
    targetContactIds: [...record.targetContactIds],
    stakeholderIds: [...record.stakeholderIds],
  }
}

function validateBusiness(form: BusinessInput) {
  if (!form.name.trim()) return '사업명을 입력해 주세요.'
  if (!form.companyId) return '대상 고객사를 선택해 주세요.'
  if (!form.startDate || !form.endDate) return '시작일과 종료예정일을 입력해 주세요.'
  if (form.endDate < form.startDate) return '종료예정일은 시작일보다 빠를 수 없습니다.'
  return ''
}

export function RelatedBusinesses({ companyId, contactId }: { companyId?: string; contactId?: string }) {
  const portfolio = useBusiness()
  const { go } = useUI()
  if (!portfolio.remote || !portfolio.ready) return null
  const items = portfolio.businesses.filter((item) => {
    if (companyId) return item.companyId === companyId
    if (!contactId) return false
    return item.targetContactIds.includes(contactId) || item.stakeholderIds.includes(contactId)
  })
  if (items.length === 0) return null
  return (
    <div className="related-biz">
      <p className="hint">관련 사업</p>
      <div className="quick-picks">
        {items.map((item) => (
          <button key={item.id} type="button" className="quick-pick" onClick={() => go({ name: 'business', id: item.id })}>
            {item.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function BusinessForm({
  form,
  setForm,
  contacts,
  saving,
  error,
  onCancel,
}: {
  form: BusinessInput
  setForm: (next: BusinessInput) => void
  contacts: Contact[]
  saving: boolean
  error?: string
  onCancel?: () => void
}) {
  const directory = useDirectory()
  const [personQuery, setPersonQuery] = useState('')
  const companyContacts = contacts.filter((contact) => contact.companyId === form.companyId)
  const query = personQuery.trim()
  const stakeholderMatches = contacts
    .filter((contact) => !form.stakeholderIds.includes(contact.id))
    .filter((contact) => {
      if (!query) return true
      const companyName = directory.companyById.get(contact.companyId)?.name ?? ''
      return contact.name.includes(query) || companyName.includes(query) || contact.department.includes(query)
    })
    .slice(0, query ? 12 : 8)

  function chooseCompany(companyId: string) {
    setForm({
      ...form,
      companyId,
      targetContactIds: form.targetContactIds.filter((id) => contacts.some((contact) => contact.id === id && contact.companyId === companyId)),
    })
  }

  return (
    <div className="card pad form-card">
      <div className="form-section">
        <h3>기본 정보</h3>
        <Field label="사업명" wide>
          <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <div className="stack-top">
          <span className="field-label">사업 유형</span>
          <div className="quick-picks">
            {BUSINESS_TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={form.type === item.id ? 'quick-pick on' : 'quick-pick'}
                aria-pressed={form.type === item.id}
                onClick={() => setForm({ ...form, type: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack-top">
          <span className="field-label">진행 상태</span>
          <div className="quick-picks">
            {BUSINESS_STATUSES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={form.status === item.id ? 'quick-pick on' : 'quick-pick'}
                aria-pressed={form.status === item.id}
                onClick={() => setForm({ ...form, status: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid stack-top">
          <Field label="시작일">
            <input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
          </Field>
          <Field label="종료예정일">
            <input className="input" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
          </Field>
          <Field label="개요" wide>
            <textarea className="textarea" value={form.overview} onChange={(event) => setForm({ ...form, overview: event.target.value })} />
          </Field>
        </div>
      </div>
      <div className="form-section">
        <h3>대상 고객</h3>
        <Field label="대상 고객사">
          <select className="input" value={form.companyId} onChange={(event) => chooseCompany(event.target.value)}>
            <option value="">고객사 선택</option>
            {directory.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </Field>
        {directory.companies.length === 0 && <p className="hint">등록된 고객사가 없습니다. 고객사 화면에서 먼저 등록해 주세요.</p>}
        {form.companyId && companyContacts.length === 0 && <p className="hint">이 고객사에 등록된 담당자가 없습니다.</p>}
        {companyContacts.length > 0 && (
          <>
            <p className="hint">대상 담당자는 선택한 고객사 소속만 고를 수 있습니다.</p>
            <div className="menu">
              {companyContacts.map((contact) => {
                const selected = form.targetContactIds.includes(contact.id)
                return (
                  <button
                    key={contact.id}
                    type="button"
                    className={selected ? 'on' : ''}
                    aria-pressed={selected}
                    onClick={() => setForm({ ...form, targetContactIds: toggleId(form.targetContactIds, contact.id) })}
                  >
                    <span>{contactLine(contact)}</span>
                    {selected && <span>선택됨</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div className="form-section">
        <h3>관계자</h3>
        <p className="hint">고객사와 관계없이 등록된 담당자를 여러 명 선택할 수 있습니다.</p>
        {form.stakeholderIds.length > 0 && (
          <div className="quick-picks">
            {form.stakeholderIds.map((id) => {
              const contact = contacts.find((item) => item.id === id)
              if (!contact) return null
              const companyName = directory.companyById.get(contact.companyId)?.name
              return (
                <button
                  key={id}
                  type="button"
                  className="quick-pick on"
                  aria-pressed="true"
                  onClick={() => setForm({ ...form, stakeholderIds: toggleId(form.stakeholderIds, id) })}
                >
                  {contactLine(contact, companyName)}
                </button>
              )
            })}
          </div>
        )}
        <Field label="담당자 검색">
          <input className="input" value={personQuery} placeholder="이름, 고객사, 부서" onChange={(event) => setPersonQuery(event.target.value)} />
        </Field>
        <div className="menu">
          {stakeholderMatches.map((contact) => {
            const selected = form.stakeholderIds.includes(contact.id)
            const companyName = directory.companyById.get(contact.companyId)?.name
            return (
              <button
                key={contact.id}
                type="button"
                className={selected ? 'on' : ''}
                aria-pressed={selected}
                onClick={() => setForm({ ...form, stakeholderIds: toggleId(form.stakeholderIds, contact.id) })}
              >
                <span>{contactLine(contact, companyName)}</span>
                {selected && <span>선택됨</span>}
              </button>
            )
          })}
        </div>
        {contacts.length === 0 && <p className="hint">등록된 담당자가 없습니다.</p>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? '저장 중' : '저장'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            취소
          </button>
        )}
      </div>
    </div>
  )
}

export function BusinessList() {
  const portfolio = useBusiness()
  const directory = useDirectory()
  const { go } = useUI()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<BusinessInput>(blankBusiness)
  const [typeFilter, setTypeFilter] = useState<BusinessType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<BusinessStatus | 'all'>('all')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const contacts = directory.contacts
  const items = useMemo(() => {
    return [...portfolio.businesses]
      .filter((item) => (typeFilter === 'all' ? true : item.type === typeFilter))
      .filter((item) => (statusFilter === 'all' ? true : item.status === statusFilter))
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name, 'ko'))
  }, [portfolio.businesses, statusFilter, typeFilter])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const message = validateBusiness(form)
    if (message) {
      setError(message)
      return
    }
    setSaving(true)
    try {
      const id = await portfolio.saveBusiness({
        ...form,
        targetContactIds: form.targetContactIds.filter((id) => contacts.some((contact) => contact.id === id && contact.companyId === form.companyId)),
        stakeholderIds: form.stakeholderIds.filter((id) => contacts.some((contact) => contact.id === id)),
      })
      setOpen(false)
      setForm(blankBusiness())
      setError('')
      go({ name: 'business', id })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (!portfolio.remote) {
    return (
      <section>
        <h1>사업</h1>
        <p className="page-intro">사업 정보는 팀 공유 화면에서 관리합니다.</p>
      </section>
    )
  }

  if (!portfolio.ready || !directory.ready) return <p className="empty">사업 정보를 불러오고 있습니다.</p>

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>사업</h1>
          <p className="page-intro">사업별 진행 상황과 일정을 영업활동과 구분하여 관리합니다.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen((value) => !value)}>
          {open ? '닫기' : '+ 사업 등록'}
        </button>
      </div>
      {portfolio.error && (
        <div className="error">
          <span>{portfolio.error}</span>{' '}
          <button type="button" className="text-btn" onClick={() => void portfolio.refresh()}>
            다시 시도
          </button>
        </div>
      )}
      <div className="quick-picks">
        <button type="button" className={typeFilter === 'all' ? 'quick-pick on' : 'quick-pick'} onClick={() => setTypeFilter('all')}>
          전체 유형
        </button>
        {BUSINESS_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={typeFilter === item.id ? 'quick-pick on' : 'quick-pick'}
            onClick={() => setTypeFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="quick-picks stack-top">
        <button type="button" className={statusFilter === 'all' ? 'quick-pick on' : 'quick-pick'} onClick={() => setStatusFilter('all')}>
          전체 상태
        </button>
        {BUSINESS_STATUSES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={statusFilter === item.id ? 'quick-pick on' : 'quick-pick'}
            onClick={() => setStatusFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {open && (
        <form className="stack-top" onSubmit={submit}>
          <BusinessForm form={form} setForm={setForm} contacts={contacts} saving={saving} error={error} onCancel={() => setOpen(false)} />
        </form>
      )}
      <div className="entity-list">
        {items.length === 0 && <p className="empty">등록된 사업이 없습니다.</p>}
        {items.map((item) => {
          const company = directory.companyById.get(item.companyId)
          const upcoming = nextPlan(portfolio.milestones.filter((milestone) => milestone.businessId === item.id))
          return (
            <button key={item.id} type="button" className="entity" onClick={() => go({ name: 'business', id: item.id })}>
              <span className="biz-entity-top">
                <strong>{item.name}</strong>
                <span className={`biz-status is-${item.status}`}>{businessStatusLabel(item.status)}</span>
              </span>
              <span>{[businessTypeLabel(item.type), company?.name, `${shortDate(item.startDate)} – ${shortDate(item.endDate)}`].filter(Boolean).join(' · ')}</span>
              <span>
                {upcoming
                  ? `다음 ${milestoneKindLabel(upcoming.kind)} · ${shortDate(upcoming.date)} ${upcoming.title}`
                  : '예정된 일정 없음'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MilestoneForm({
  form,
  setForm,
  saving,
  onCancel,
  onDelete,
}: {
  form: MilestoneInput
  setForm: (next: MilestoneInput) => void
  saving: boolean
  onCancel: () => void
  onDelete?: () => void
}) {
  return (
    <>
      <div className="form-section">
        <h3>{form.id ? '일정 수정' : '일정 등록'}</h3>
        <Field label="일정명" wide>
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <div className="form-grid stack-top">
          <Field label="날짜">
            <input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label="구분">
            <select className="input" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as MilestoneKind })}>
              {MILESTONE_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="상태">
            <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MilestoneStatus })}>
              {MILESTONE_STATUSES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="메모" wide>
            <textarea className="textarea" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} />
          </Field>
        </div>
      </div>
      <div className="button-row">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? '저장 중' : '저장'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          취소
        </button>
        {onDelete && (
          <button type="button" className="text-btn danger" onClick={onDelete}>
            삭제
          </button>
        )}
      </div>
    </>
  )
}

function BusinessSchedule({ businessId }: { businessId: string }) {
  const portfolio = useBusiness()
  const [cursor, setCursor] = useState(todayKey)
  const [selected, setSelected] = useState(todayKey)
  const [form, setForm] = useState<MilestoneInput | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const items = portfolio.milestones
    .filter((item) => item.businessId === businessId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'))
  const cells = monthCells(cursor)
  const today = todayKey()

  function startCreate(date: string) {
    setSelected(date)
    setForm({ businessId, title: '', date, kind: 'schedule', memo: '', status: 'planned' })
    setError('')
  }

  function startEdit(item: Milestone) {
    setSelected(item.date)
    setCursor(item.date)
    setForm({
      id: item.id,
      businessId,
      title: item.title,
      date: item.date,
      kind: item.kind,
      memo: item.memo,
      status: item.status,
    })
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    if (!form.title.trim()) {
      setError('일정명을 입력해 주세요.')
      return
    }
    if (!form.date) {
      setError('일정 날짜를 선택해 주세요.')
      return
    }
    setSaving(true)
    try {
      await portfolio.saveMilestone(form)
      setForm(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!form?.id) return
    if (!window.confirm('이 일정을 삭제할까요?')) return
    setSaving(true)
    try {
      await portfolio.deleteMilestone(form.id)
      setForm(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dossier-panel" role="tabpanel">
      <div className="dossier-panel-head">
        <div>
          <h2>사업 일정</h2>
          <p className="hint">이 사업의 일정과 마일스톤입니다. 영업 캘린더와는 별도로 표시됩니다.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => startCreate(selected || today)}>
          + 일정 등록
        </button>
      </div>
      <div className="biz-cal">
        <div className="biz-cal-head">
          <button type="button" className="icon-btn" onClick={() => setCursor((value) => addMonths(value, -1))} aria-label="이전 달">
            ‹
          </button>
          <strong>{formatMonthTitle(cursor)}</strong>
          <div className="cal-actions">
            <button type="button" className="pill" onClick={() => setCursor(today)}>
              오늘
            </button>
            <button type="button" className="icon-btn" onClick={() => setCursor((value) => addMonths(value, 1))} aria-label="다음 달">
              ›
            </button>
          </div>
        </div>
        <div className="biz-grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="biz-dow">
              {label}
            </div>
          ))}
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="biz-day empty" />
            const dayItems = items.filter((item) => item.date === day)
            const shown = dayItems.slice(0, 2)
            const extra = dayItems.length - shown.length
            const className = ['biz-day', day === today ? 'today' : '', day === selected ? 'selected' : ''].filter(Boolean).join(' ')
            return (
              <div key={day} className={className} onClick={() => setSelected(day)}>
                <button
                  type="button"
                  className="biz-num"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelected(day)
                  }}
                >
                  {Number(day.slice(-2))}
                </button>
                {shown.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.kind === 'milestone' ? 'biz-pill milestone' : 'biz-pill'}
                    onClick={(event) => {
                      event.stopPropagation()
                      startEdit(item)
                    }}
                  >
                    {item.status === 'done' ? `완료 · ${item.title}` : item.title}
                  </button>
                ))}
                {extra > 0 && <span className="month-more">+{extra}</span>}
              </div>
            )
          })}
        </div>
      </div>
      {form && (
        <form className="stack-top" onSubmit={submit}>
          <MilestoneForm form={form} setForm={setForm} saving={saving} onCancel={() => setForm(null)} onDelete={form.id ? remove : undefined} />
          {error && <p className="error">{error}</p>}
        </form>
      )}
      <div className="participant-list">
        <h3>일정 목록</h3>
        {items.length === 0 && <p className="empty">등록된 일정이 없습니다.</p>}
        {items.map((item) => (
          <button key={item.id} type="button" className="entity" onClick={() => startEdit(item)}>
            <strong>{item.title}</strong>
            <span>
              {shortDate(item.date)} · {milestoneKindLabel(item.kind)} · {milestoneStatusLabel(item.status)}
            </span>
            {item.memo && <span>{item.memo}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BusinessDetail({ id }: { id: string }) {
  const portfolio = useBusiness()
  const directory = useDirectory()
  const { db } = useCrm()
  const { go, openCreate } = useUI()
  const [tab, setTab] = useState<'info' | 'history' | 'schedule'>('info')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<BusinessInput>(blankBusiness)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const record = portfolio.businesses.find((item) => item.id === id)

  if (!portfolio.remote) {
    return (
      <section>
        <button type="button" className="back" onClick={() => go({ name: 'businesses' })}>
          ← 사업
        </button>
        <p className="empty">사업 정보는 팀 공유 화면에서 관리합니다.</p>
      </section>
    )
  }
  if (!portfolio.ready || !directory.ready) return <p className="empty">사업 정보를 불러오고 있습니다.</p>
  if (!record) {
    return (
      <section className="card pad">
        <p className="empty">사업을 찾지 못했습니다.</p>
        <button type="button" className="btn ghost" onClick={() => go({ name: 'businesses' })}>
          사업 목록
        </button>
      </section>
    )
  }

  const company = directory.companyById.get(record.companyId)
  const contacts = directory.contacts
  const targets = record.targetContactIds
    .map((contactId) => contacts.find((contact) => contact.id === contactId))
    .filter((contact): contact is Contact => Boolean(contact))
  const stakeholders = record.stakeholderIds
    .map((contactId) => contacts.find((contact) => contact.id === contactId))
    .filter((contact): contact is Contact => Boolean(contact))
  const activities = db.activities.filter((activity) => activity.businessId === record.id)
  const upcoming = nextPlan(portfolio.milestones.filter((item) => item.businessId === record.id))
  const plannedCount = activities.filter((activity) => activity.status === 'planned').length
  const doneCount = activities.filter((activity) => activity.status === 'done').length

  function startEdit() {
    if (!record) return
    setForm(toInput(record))
    setEditing(true)
    setError('')
    setTab('info')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const message = validateBusiness(form)
    if (message) {
      setError(message)
      return
    }
    setSaving(true)
    try {
      await portfolio.saveBusiness({
        ...form,
        targetContactIds: form.targetContactIds.filter((contactId) =>
          contacts.some((contact) => contact.id === contactId && contact.companyId === form.companyId),
        ),
        stakeholderIds: form.stakeholderIds.filter((contactId) => contacts.some((contact) => contact.id === contactId)),
      })
      setEditing(false)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <button type="button" className="back" onClick={() => go({ name: 'businesses' })}>
        ← 사업
      </button>
      <article className="dossier">
        <header className="dossier-head">
          <div>
            <h1>{record.name}</h1>
            <p className="dossier-kicker">
              {[businessTypeLabel(record.type), businessStatusLabel(record.status), company?.name].filter(Boolean).join(' · ')}
            </p>
            <div className="chips">
              <span className="chip">{businessTypeLabel(record.type)}</span>
              <span className="chip">{businessStatusLabel(record.status)}</span>
              <span className="chip">
                {shortDate(record.startDate)} – {shortDate(record.endDate)}
              </span>
            </div>
          </div>
          <div className="dossier-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                openCreate({
                  date: todayKey(),
                  companyId: record.companyId,
                  contactIds: record.targetContactIds,
                  businessId: record.id,
                })
              }
            >
              + 영업활동 등록
            </button>
            <button type="button" className="btn ghost" onClick={startEdit}>
              사업 정보 수정
            </button>
          </div>
        </header>
        <div className="dossier-tabs" role="tablist" aria-label="사업 기록">
          {(
            [
              ['info', '사업 정보'],
              ['history', '활동 이력'],
              ['schedule', '일정'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'dossier-tab on' : 'dossier-tab'}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'info' && (
          <div className="dossier-panel" role="tabpanel">
            {editing ? (
              <form onSubmit={submit}>
                <BusinessForm form={form} setForm={setForm} contacts={contacts} saving={saving} error={error} onCancel={() => setEditing(false)} />
              </form>
            ) : (
              <>
                <div className="dash-stats in-dossier">
                  <div className="dash-stat">
                    <strong>{activities.length}</strong>
                    <span>영업활동</span>
                  </div>
                  <div className="dash-stat">
                    <strong>{plannedCount}</strong>
                    <span>예정</span>
                  </div>
                  <div className="dash-stat">
                    <strong>{doneCount}</strong>
                    <span>완료</span>
                  </div>
                </div>
                <p className="hint">
                  {upcoming
                    ? `다음 ${milestoneKindLabel(upcoming.kind)} · ${shortDate(upcoming.date)} ${upcoming.title}`
                    : '예정된 일정이 없습니다.'}
                </p>
                <dl className="facts">
                  <div className="wide">
                    <dt>개요</dt>
                    <dd className="overview-text">{record.overview || '등록된 개요가 없습니다.'}</dd>
                  </div>
                  <div>
                    <dt>대상 고객사</dt>
                    <dd>
                      {company ? (
                        <button type="button" className="text-btn" onClick={() => go({ name: 'company', id: company.id })}>
                          {company.name}
                        </button>
                      ) : (
                        '고객사 정보 없음'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>기간</dt>
                    <dd>
                      {shortDate(record.startDate)} – {shortDate(record.endDate)}
                    </dd>
                  </div>
                </dl>
                <h2 className="stack-top">대상 담당자</h2>
                {targets.length === 0 && <p className="empty">선택된 대상 담당자가 없습니다.</p>}
                <div className="quick-picks">
                  {targets.map((contact) => (
                    <button key={contact.id} type="button" className="quick-pick" onClick={() => go({ name: 'contact', id: contact.id })}>
                      {contactLine(contact)}
                    </button>
                  ))}
                </div>
                <h2 className="stack-top">관계자</h2>
                {stakeholders.length === 0 && <p className="empty">선택된 관계자가 없습니다.</p>}
                <div className="quick-picks">
                  {stakeholders.map((contact) => (
                    <button key={contact.id} type="button" className="quick-pick" onClick={() => go({ name: 'contact', id: contact.id })}>
                      {contactLine(contact, directory.companyById.get(contact.companyId)?.name)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'history' && (
          <div className="dossier-panel" role="tabpanel">
            <div className="dossier-panel-head">
              <div>
                <h2>영업활동 이력</h2>
                <p className="hint">이 사업에 연결한 미팅, 메일, 제안 등의 영업활동입니다. 사업 일정과는 따로 표시됩니다.</p>
              </div>
              <span>최근순</span>
            </div>
            <RelationTimeline activities={activities} empty="이 사업에 연결된 영업활동이 없습니다." />
          </div>
        )}
        {tab === 'schedule' && <BusinessSchedule businessId={record.id} />}
      </article>
    </section>
  )
}
