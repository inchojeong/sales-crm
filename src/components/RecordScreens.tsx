import { useState, type ReactNode } from 'react'
import { RelationTimeline, Timeline } from './ActivityRow'
import { formatDayTitle, formatFullDate, todayKey } from '../dates'
import { useCrm } from '../store'
import type { Activity, CompanyInput, ContactInput, EventInput } from '../types'
import { useUI } from '../ui'

const blankCompany: CompanyInput = {
  name: '',
  industry: '',
  website: '',
  phone: '',
  address: '',
  summary: '',
}

function blankContact(companyId: string): ContactInput {
  return { companyId, name: '', department: '', position: '', email: '', phone: '', memo: '' }
}

function latestDate(items: Activity[]) {
  return items.reduce<string | null>((max, item) => (max === null || item.date > max ? item.date : max), null)
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function Missing({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <section className="card pad">
      <p className="empty">{text}</p>
      <button type="button" className="btn ghost" onClick={onBack}>
        목록으로
      </button>
    </section>
  )
}

export function CompanyList() {
  const { db, saveCompany } = useCrm()
  const { go } = useUI()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CompanyInput>(blankCompany)
  const [error, setError] = useState('')
  const companies = [...db.companies].sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  function submit() {
    if (!form.name.trim()) {
      setError('고객사명을 입력해 주세요.')
      return
    }
    const id = saveCompany(form)
    setOpen(false)
    setForm(blankCompany)
    go({ name: 'company', id })
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>고객사</h1>
          <p className="page-intro">고객사별 담당자를 등록하고 관리할 수 있습니다.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen((value) => !value)}>
          {open ? '닫기' : '+ 고객사 등록'}
        </button>
      </div>
      {open && (
        <div className="card pad form-card">
          <div className="form-grid">
            <Field label="고객사명">
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="업종">
              <input className="input" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} />
            </Field>
            <Field label="홈페이지">
              <input className="input" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </Field>
            <Field label="대표 연락처">
              <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="주소" wide>
              <input className="input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label="소개" wide>
              <textarea className="textarea" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn primary" onClick={submit}>
            저장
          </button>
        </div>
      )}
      <div className="entity-list">
        {companies.map((company) => {
          const people = db.contacts.filter((contact) => contact.companyId === company.id).length
          const latest = latestDate(db.activities.filter((activity) => activity.companyId === company.id))
          return (
            <button key={company.id} type="button" className="entity" onClick={() => go({ name: 'company', id: company.id })}>
              <strong>{company.name}</strong>
              <span>
                {[company.industry, `담당자 ${people}명`].filter(Boolean).join(' · ')}
              </span>
              <span>{latest ? `최근 영업활동 ${formatDayTitle(latest)}` : '영업활동 없음'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

type CompanyTab = 'history' | 'people' | 'info'

export function CompanyDetail({ id }: { id: string }) {
  const { db, saveCompany, saveContact, eventById } = useCrm()
  const { go, openCreate } = useUI()
  const company = db.companies.find((item) => item.id === id)
  const [tab, setTab] = useState<CompanyTab>('history')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CompanyInput>(blankCompany)
  const [adding, setAdding] = useState(false)
  const [contactForm, setContactForm] = useState<ContactInput>(() => blankContact(id))
  const [error, setError] = useState('')

  if (!company) return <Missing text="고객사를 찾지 못했습니다." onBack={() => go({ name: 'companies' })} />

  const people = db.contacts
    .filter((contact) => contact.companyId === company.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const activities = db.activities.filter((activity) => activity.companyId === company.id)

  function startEdit() {
    if (!company) return
    setForm({
      id: company.id,
      name: company.name,
      industry: company.industry,
      website: company.website,
      phone: company.phone,
      address: company.address,
      summary: company.summary,
    })
    setEditing(true)
    setError('')
  }

  function saveEdit() {
    if (!form.name.trim()) {
      setError('고객사명을 입력해 주세요.')
      return
    }
    saveCompany(form)
    setEditing(false)
  }

  function savePerson() {
    if (!contactForm.name.trim()) {
      setError('담당자명을 입력해 주세요.')
      return
    }
    saveContact({ ...contactForm, companyId: id })
    setContactForm(blankContact(id))
    setAdding(false)
    setError('')
  }

  const eventNames = [
    ...new Set(
      activities
        .map((activity) => (activity.eventId ? eventById.get(activity.eventId)?.name : ''))
        .filter((name): name is string => Boolean(name)),
    ),
  ]
  const chips = [company.industry, ...eventNames, `담당자 ${people.length}명`].filter(Boolean)

  function openTab(next: CompanyTab) {
    setTab(next)
    setError('')
  }

  return (
    <section>
      <button type="button" className="back" onClick={() => go({ name: 'companies' })}>
        ← 고객사
      </button>
      <article className="dossier">
        <header className="dossier-head">
          <div>
            <h1>{company.name}</h1>
            <p className="dossier-kicker">{[company.industry, company.address, '고객사 상세'].filter(Boolean).join(' · ')}</p>
            <div className="chips">
              {chips.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="btn primary" onClick={() => openCreate({ date: todayKey(), companyId: company.id })}>
            + 영업활동 등록
          </button>
        </header>
        <div className="dossier-tabs" role="tablist" aria-label="고객사 기록">
          {(
            [
              ['history', '활동 이력'],
              ['people', '담당자'],
              ['info', '고객사 정보'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'dossier-tab on' : 'dossier-tab'}
              onClick={() => openTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'history' && (
          <div className="dossier-panel" role="tabpanel">
            <div className="dossier-panel-head">
              <h2>영업활동 이력</h2>
              <span>최근순</span>
            </div>
            <RelationTimeline activities={activities} empty="등록된 영업활동이 없습니다." />
          </div>
        )}
        {tab === 'people' && (
          <div className="dossier-panel" role="tabpanel">
            <div className="dossier-panel-head">
              <h2>담당자</h2>
              <button type="button" className="text-btn" onClick={() => setAdding((value) => !value)}>
                {adding ? '닫기' : '담당자 등록'}
              </button>
            </div>
            {adding && (
              <div className="form-card inner">
                <Field label="담당자명">
                  <input className="input" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} />
                </Field>
                <div className="form-grid">
                  <Field label="부서">
                    <input className="input" value={contactForm.department} onChange={(event) => setContactForm({ ...contactForm, department: event.target.value })} />
                  </Field>
                  <Field label="직책">
                    <input className="input" value={contactForm.position} onChange={(event) => setContactForm({ ...contactForm, position: event.target.value })} />
                  </Field>
                  <Field label="이메일">
                    <input className="input" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} />
                  </Field>
                  <Field label="연락처">
                    <input className="input" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} />
                  </Field>
                </div>
                <Field label="메모">
                  <textarea className="textarea" value={contactForm.memo} onChange={(event) => setContactForm({ ...contactForm, memo: event.target.value })} />
                </Field>
                {error && <p className="error">{error}</p>}
                <button type="button" className="btn primary" onClick={savePerson}>
                  저장
                </button>
              </div>
            )}
            <div className="entity-list">
              {people.length === 0 && <p className="empty">등록된 담당자가 없습니다.</p>}
              {people.map((contact) => (
                <button key={contact.id} type="button" className="entity" onClick={() => go({ name: 'contact', id: contact.id })}>
                  <strong>
                    {contact.name} {contact.position}
                  </strong>
                  <span>{contact.department}</span>
                  {(contact.email || contact.phone) && (
                    <span className="entity-contact">{[contact.phone, contact.email].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'info' && (
          <div className="dossier-panel" role="tabpanel">
            <div className="dossier-panel-head">
              <h2>고객사 정보</h2>
              {!editing && (
                <button type="button" className="text-btn" onClick={startEdit}>
                  수정
                </button>
              )}
            </div>
            {!editing ? (
              <dl className="facts">
                <div>
                  <dt>업종</dt>
                  <dd>{company.industry || '—'}</dd>
                </div>
                <div>
                  <dt>대표 연락처</dt>
                  <dd>{company.phone || '—'}</dd>
                </div>
                <div>
                  <dt>주소</dt>
                  <dd>{company.address || '—'}</dd>
                </div>
                <div>
                  <dt>홈페이지</dt>
                  <dd>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer">
                        {company.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="wide">
                  <dt>소개</dt>
                  <dd>{company.summary || '—'}</dd>
                </div>
              </dl>
            ) : (
              <div className="form-card inner">
                <div className="form-grid">
                  <Field label="고객사명">
                    <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                  </Field>
                  <Field label="업종">
                    <input className="input" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} />
                  </Field>
                  <Field label="홈페이지">
                    <input className="input" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
                  </Field>
                  <Field label="대표 연락처">
                    <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </Field>
                  <Field label="주소" wide>
                    <input className="input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                  </Field>
                  <Field label="소개" wide>
                    <textarea className="textarea" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
                  </Field>
                </div>
                {error && <p className="error">{error}</p>}
                <div className="button-row">
                  <button type="button" className="btn primary" onClick={saveEdit}>
                    저장
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  )
}

export function ContactList() {
  const { db } = useCrm()
  const { go } = useUI()
  const contacts = [...db.contacts].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>담당자</h1>
          <p className="page-intro">담당자별 영업활동 이력을 확인할 수 있습니다.</p>
        </div>
      </div>
      <div className="entity-list">
        {contacts.map((contact) => {
          const company = db.companies.find((item) => item.id === contact.companyId)
          const latest = latestDate(db.activities.filter((activity) => activity.contactIds.includes(contact.id)))
          return (
            <button key={contact.id} type="button" className="entity" onClick={() => go({ name: 'contact', id: contact.id })}>
              <strong>
                {contact.name} {contact.position}
              </strong>
              <span>{[company?.name, contact.department].filter(Boolean).join(' · ')}</span>
              <span>{latest ? `최근 영업활동 ${formatDayTitle(latest)}` : '영업활동 없음'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function ContactDetail({ id }: { id: string }) {
  const { db, saveContact, companyById } = useCrm()
  const { go, openCreate } = useUI()
  const contact = db.contacts.find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContactInput>(() => blankContact(''))
  const [error, setError] = useState('')

  if (!contact) return <Missing text="담당자를 찾지 못했습니다." onBack={() => go({ name: 'contacts' })} />

  const company = companyById.get(contact.companyId)
  const activities = db.activities.filter((activity) => activity.contactIds.includes(contact.id))

  function startEdit() {
    if (!contact) return
    setForm({
      id: contact.id,
      companyId: contact.companyId,
      name: contact.name,
      department: contact.department,
      position: contact.position,
      email: contact.email,
      phone: contact.phone,
      memo: contact.memo,
    })
    setEditing(true)
  }

  function save() {
    if (!form.name.trim()) {
      setError('담당자명을 입력해 주세요.')
      return
    }
    saveContact(form)
    setEditing(false)
  }

  return (
    <section>
      <button type="button" className="back" onClick={() => go({ name: 'contacts' })}>
        ← 담당자
      </button>
      <div className="split">
        <section className="card pad">
          <h1>
            {contact.name} {contact.position}
          </h1>
          <p className="page-intro">{[company?.name, contact.department].filter(Boolean).join(' · ')}</p>
          <p className="meta-line">{[contact.email, contact.phone].filter(Boolean).join(' · ')}</p>
          {contact.memo && <p className="summary">{contact.memo}</p>}
          <div className="button-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => openCreate({ date: todayKey(), companyId: contact.companyId, contactIds: [contact.id] })}
            >
              + 영업활동 등록
            </button>
            {company && (
              <button type="button" className="btn ghost" onClick={() => go({ name: 'company', id: company.id })}>
                고객사 보기
              </button>
            )}
          </div>
          {!editing ? (
            <button type="button" className="text-btn follow-btn" onClick={startEdit}>
              담당자 정보 수정
            </button>
          ) : (
            <div className="form-card inner">
              <Field label="담당자명">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <div className="form-grid">
                <Field label="부서">
                  <input className="input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
                </Field>
                <Field label="직책">
                  <input className="input" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
                </Field>
              </div>
              <Field label="이메일">
                <input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </Field>
              <Field label="연락처">
                <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label="메모">
                <textarea className="textarea" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} />
              </Field>
              {error && <p className="error">{error}</p>}
              <div className="button-row">
                <button type="button" className="btn primary" onClick={save}>
                  저장
                </button>
                <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="card pad">
          <h2>영업활동 이력</h2>
          <Timeline activities={activities} empty="등록된 영업활동이 없습니다." />
        </section>
      </div>
    </section>
  )
}

export function EventList() {
  const { db, saveEvent } = useCrm()
  const { go } = useUI()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EventInput>({ name: '', startDate: todayKey(), endDate: todayKey(), place: '', memo: '' })
  const [error, setError] = useState('')
  const events = [...db.events].sort((a, b) => b.startDate.localeCompare(a.startDate))

  function submit() {
    if (!form.name.trim()) {
      setError('행사명을 입력해 주세요.')
      return
    }
    if (form.endDate && form.endDate < form.startDate) {
      setError('종료일은 시작일보다 빠를 수 없습니다.')
      return
    }
    const id = saveEvent(form)
    setOpen(false)
    go({ name: 'event', id })
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>행사</h1>
          <p className="page-intro">행사에서 확보한 고객정보와 후속 영업활동을 통합 관리합니다.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen((value) => !value)}>
          {open ? '닫기' : '+ 행사 등록'}
        </button>
      </div>
      {open && (
        <div className="card pad form-card">
          <div className="form-grid">
            <Field label="행사명" wide>
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="시작일">
              <input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </Field>
            <Field label="종료일">
              <input className="input" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </Field>
            <Field label="장소" wide>
              <input className="input" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} />
            </Field>
            <Field label="메모" wide>
              <textarea className="textarea" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} />
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn primary" onClick={submit}>
            저장
          </button>
        </div>
      )}
      <div className="entity-list">
        {events.map((event) => {
          const linked = db.activities.filter((activity) => activity.eventId === event.id)
          const companyCount = new Set(linked.map((activity) => activity.companyId).filter(Boolean)).size
          return (
            <button key={event.id} type="button" className="entity" onClick={() => go({ name: 'event', id: event.id })}>
              <strong>{event.name}</strong>
              <span>{[formatFullDate(event.startDate), event.place].filter(Boolean).join(' · ')}</span>
              <span>
                영업활동 {linked.length}건 · 고객사 {companyCount}곳
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function EventDetail({ id }: { id: string }) {
  const { db, saveEvent } = useCrm()
  const { go, openCreate } = useUI()
  const eventItem = db.events.find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EventInput>({ name: '', startDate: '', endDate: '', place: '', memo: '' })
  const [error, setError] = useState('')

  if (!eventItem) return <Missing text="행사를 찾지 못했습니다." onBack={() => go({ name: 'events' })} />

  const activities = db.activities.filter((activity) => activity.eventId === eventItem.id)
  const companyIds = [...new Set(activities.map((activity) => activity.companyId).filter((value): value is string => Boolean(value)))]

  function startEdit() {
    if (!eventItem) return
    setForm({
      id: eventItem.id,
      name: eventItem.name,
      startDate: eventItem.startDate,
      endDate: eventItem.endDate,
      place: eventItem.place,
      memo: eventItem.memo,
    })
    setEditing(true)
  }

  function save() {
    if (!form.name.trim()) {
      setError('행사명을 입력해 주세요.')
      return
    }
    if (form.endDate && form.endDate < form.startDate) {
      setError('종료일은 시작일보다 빠를 수 없습니다.')
      return
    }
    saveEvent(form)
    setEditing(false)
  }

  return (
    <section>
      <button type="button" className="back" onClick={() => go({ name: 'events' })}>
        ← 행사
      </button>
      <div className="card pad">
        <div className="page-head">
          <div>
            <h1>{eventItem.name}</h1>
            <p className="page-intro">
              {[formatFullDate(eventItem.startDate), eventItem.endDate !== eventItem.startDate ? formatFullDate(eventItem.endDate) : '', eventItem.place]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => openCreate({ date: eventItem.startDate || todayKey(), eventId: eventItem.id, type: 'event' })}
          >
            + 영업활동 등록
          </button>
        </div>
        {eventItem.memo && <p className="summary">{eventItem.memo}</p>}
        <div className="chip-row">
          {companyIds.map((companyId) => {
            const company = db.companies.find((item) => item.id === companyId)
            if (!company) return null
            return (
              <button key={companyId} type="button" className="chip" onClick={() => go({ name: 'company', id: companyId })}>
                {company.name}
              </button>
            )
          })}
        </div>
        {!editing ? (
          <button type="button" className="text-btn follow-btn" onClick={startEdit}>
            행사 정보 수정
          </button>
        ) : (
          <div className="form-card inner">
            <Field label="행사명">
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label="시작일">
                <input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
              </Field>
              <Field label="종료일">
                <input className="input" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
              </Field>
            </div>
            <Field label="장소">
              <input className="input" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} />
            </Field>
            <Field label="메모">
              <textarea className="textarea" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} />
            </Field>
            {error && <p className="error">{error}</p>}
            <div className="button-row">
              <button type="button" className="btn primary" onClick={save}>
                저장
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
      <section className="card pad stack-top">
        <h2>연결된 영업활동</h2>
        <Timeline activities={activities} empty="등록된 영업활동이 없습니다." />
      </section>
    </section>
  )
}
