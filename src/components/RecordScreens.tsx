import { useState, type ReactNode } from 'react'
import { isEventAttendance } from '../attendance'
import { useBusiness } from '../business'
import { RelationTimeline, Timeline } from './ActivityRow'
import { RelatedBusinesses } from './BusinessScreens'
import { formatDayTitle, formatFullDate, todayKey, defaultStatus } from '../dates'
import { useDirectory } from '../directory'
import { useCrm } from '../store'
import type { Activity, CompanyInput, Contact, ContactInput, EventInput } from '../types'
import { autoTitle } from '../templates'
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
  const directory = useDirectory()
  const { go } = useUI()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CompanyInput>(blankCompany)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const remote = directory.remote
  const companies = [...(remote ? directory.companies : db.companies)].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const contacts = remote ? directory.contacts : db.contacts

  async function submit() {
    if (!form.name.trim()) {
      setError('고객사명을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      const id = remote ? await directory.saveCompany(form) : saveCompany(form)
      setOpen(false)
      setForm(blankCompany)
      setError('')
      go({ name: 'company', id })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
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
          <button type="button" className="btn primary" onClick={submit} disabled={saving}>
            {saving ? '저장 중' : '저장'}
          </button>
        </div>
      )}
      {remote && directory.error && <p className="error">{directory.error}</p>}
      {remote && !directory.ready ? (
        <p className="empty">고객사 정보를 불러오고 있습니다.</p>
      ) : (
      <div className="entity-list">
        {companies.map((company) => {
          const people = contacts.filter((contact) => contact.companyId === company.id).length
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
      )}
    </section>
  )
}

type CompanyTab = 'history' | 'people' | 'info'

export function CompanyDetail({ id }: { id: string }) {
  const { db, saveCompany, saveContact, eventById, releaseCompany } = useCrm()
  const directory = useDirectory()
  const portfolio = useBusiness()
  const { go, openCreate } = useUI()
  const remote = directory.remote
  const company = (remote ? directory.companies : db.companies).find((item) => item.id === id)
  const [tab, setTab] = useState<CompanyTab>('history')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CompanyInput>(blankCompany)
  const [adding, setAdding] = useState(false)
  const [contactForm, setContactForm] = useState<ContactInput>(() => blankContact(id))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (remote && !directory.ready) return <p className="empty">고객사 정보를 불러오고 있습니다.</p>
  if (!company) return <Missing text="고객사를 찾지 못했습니다." onBack={() => go({ name: 'companies' })} />

  const people = (remote ? directory.contacts : db.contacts)
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

  async function saveEdit() {
    if (!form.name.trim()) {
      setError('고객사명을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      if (remote) await directory.saveCompany(form)
      else saveCompany(form)
      setEditing(false)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function removeCompany() {
    if (!company) return
    const linked = portfolio.businesses.filter((item) => item.companyId === company.id)
    if (linked.length > 0) {
      setError(`연결된 사업이 있어 삭제할 수 없습니다. ${linked.map((item) => item.name).join(', ')}`)
      return
    }
    const peopleNote = people.length > 0 ? ` 소속 담당자 ${people.length}명도 함께 삭제됩니다.` : ''
    if (!window.confirm(`${company.name} 고객사를 삭제할까요?${peopleNote} 영업활동 기록은 남고 고객사 연결만 해제됩니다.`)) return
    const contactIds = people.map((person) => person.id)
    setSaving(true)
    setError('')
    try {
      if (remote) await directory.deleteCompany(company.id)
      releaseCompany(company.id, contactIds)
      void portfolio.refresh()
      go({ name: 'companies' })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function savePerson() {
    if (!contactForm.name.trim()) {
      setError('담당자명을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      const input = { ...contactForm, companyId: id }
      if (remote) await directory.saveContact(input)
      else saveContact(input)
      setContactForm(blankContact(id))
      setAdding(false)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
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
            <RelatedBusinesses companyId={company.id} />
          </div>
          <div className="head-actions">
            <button type="button" className="btn primary" onClick={() => openCreate({ date: todayKey(), companyId: company.id })}>
              + 영업활동 등록
            </button>
            <button type="button" className="text-btn danger" onClick={() => void removeCompany()} disabled={saving}>
              고객사 삭제
            </button>
          </div>
        </header>
        {error && !editing && !adding && <p className="error">{error}</p>}
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
                <button type="button" className="btn primary" onClick={savePerson} disabled={saving}>
                  {saving ? '저장 중' : '저장'}
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
                  <button type="button" className="btn primary" onClick={saveEdit} disabled={saving}>
                    {saving ? '저장 중' : '저장'}
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
  const directory = useDirectory()
  const { go } = useUI()
  const remote = directory.remote
  const contacts = [...(remote ? directory.contacts : db.contacts)].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const companies = remote ? directory.companies : db.companies
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>담당자</h1>
          <p className="page-intro">담당자별 영업활동 이력을 확인할 수 있습니다.</p>
        </div>
      </div>
      {remote && directory.error && <p className="error">{directory.error}</p>}
      {remote && !directory.ready ? (
        <p className="empty">담당자 정보를 불러오고 있습니다.</p>
      ) : (
      <div className="entity-list">
        {contacts.map((contact) => {
          const company = companies.find((item) => item.id === contact.companyId)
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
      )}
    </section>
  )
}

export function ContactDetail({ id }: { id: string }) {
  const { db, saveContact, companyById, releaseContact } = useCrm()
  const directory = useDirectory()
  const portfolio = useBusiness()
  const { go, openCreate } = useUI()
  const remote = directory.remote
  const contact = (remote ? directory.contacts : db.contacts).find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContactInput>(() => blankContact(''))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (remote && !directory.ready) return <p className="empty">담당자 정보를 불러오고 있습니다.</p>
  if (!contact) return <Missing text="담당자를 찾지 못했습니다." onBack={() => go({ name: 'contacts' })} />

  const company = remote ? directory.companyById.get(contact.companyId) : companyById.get(contact.companyId)
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

  async function removeContact() {
    if (!contact) return
    if (!window.confirm(`${contact.name} 담당자를 삭제할까요? 고객사와 영업활동 기록은 남고, 이 담당자와의 연결만 해제됩니다.`)) return
    setSaving(true)
    setError('')
    try {
      if (remote) await directory.deleteContact(contact.id)
      releaseContact(contact.id)
      void portfolio.refresh()
      go({ name: 'contacts' })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!form.name.trim()) {
      setError('담당자명을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      if (remote) await directory.saveContact(form)
      else saveContact(form)
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
      <button type="button" className="back" onClick={() => go({ name: 'contacts' })}>
        ← 담당자
      </button>
      <div className="split">
        <section className="card pad">
          <h1>
            {contact.name} {contact.position}
          </h1>
          <p className="page-intro">{[company?.name, contact.department].filter(Boolean).join(' · ')}</p>
          <RelatedBusinesses contactId={contact.id} />
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
            <button type="button" className="text-btn danger" onClick={() => void removeContact()} disabled={saving}>
              담당자 삭제
            </button>
          </div>
          {error && !editing && <p className="error">{error}</p>}
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
                <button type="button" className="btn primary" onClick={save} disabled={saving}>
                  {saving ? '저장 중' : '저장'}
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

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

interface DraftPerson {
  key: string
  name: string
  department: string
  position: string
}

function blankPerson(): DraftPerson {
  return { key: crypto.randomUUID(), name: '', department: '', position: '' }
}

function EventPeople({
  eventId,
  eventDate,
}: {
  eventId: string
  eventDate: string
}) {
  const { db, saveActivity, saveCompany, saveContact, deleteActivity } = useCrm()
  const directory = useDirectory()
  const { go } = useUI()
  const remote = directory.remote
  const companies = remote ? directory.companies : db.companies
  const contacts = remote ? directory.contacts : db.contacts
  const [companyQuery, setCompanyQuery] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [contactIds, setContactIds] = useState<string[]>([])
  const [drafts, setDrafts] = useState<DraftPerson[]>([])
  const [note, setNote] = useState('')
  const [opinion, setOpinion] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editOpinion, setEditOpinion] = useState('')
  const [editName, setEditName] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editPosition, setEditPosition] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [contactFilter, setContactFilter] = useState('')

  const attendance = db.activities.filter((activity) => activity.eventId === eventId && isEventAttendance(activity))
  const selectedCompany = companies.find((company) => company.id === companyId)
  const companyContacts = companyId ? contacts.filter((contact) => contact.companyId === companyId) : []
  const query = companyQuery.trim()
  const matches = query
    ? companies.filter((company) => company.name.includes(query) || company.industry.includes(query)).slice(0, 8)
    : companies.slice(0, 8)
  const exactCompany = companies.find((company) => sameName(company.name, query))

  function findCompany(id: string | null) {
    if (!id) return undefined
    return companies.find((item) => item.id === id) ?? db.companies.find((item) => item.id === id)
  }
  function findContact(id: string) {
    return contacts.find((item) => item.id === id) ?? db.contacts.find((item) => item.id === id)
  }

  const participants = attendance.flatMap((activity) => {
    const company = findCompany(activity.companyId)
    const ids = activity.contactIds.length > 0 ? activity.contactIds : ['']
    return ids.map((contactId) => ({
      activity,
      contactId,
      contact: contactId ? findContact(contactId) : undefined,
      company,
    }))
  })
  const participantGroups = new Map<string, typeof participants>()
  for (const row of participants) {
    const key = row.activity.companyId ?? 'none'
    const current = participantGroups.get(key) ?? []
    current.push(row)
    participantGroups.set(key, current)
  }

  function chooseCompany(id: string) {
    const people = contacts.filter((contact) => contact.companyId === id)
    setCompanyId(id)
    setCompanyQuery('')
    setContactFilter('')
    setContactIds([])
    setDrafts(people.length === 0 ? [blankPerson()] : [])
    setError('')
    setNotice('')
  }

  function clearCompany() {
    setCompanyId(null)
    setContactFilter('')
    setContactIds([])
    setDrafts([])
    setError('')
    setNotice('')
  }

  function toggleContact(id: string) {
    setContactIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
    setError('')
    setNotice('')
  }

  function patchDraft(key: string, patch: Partial<DraftPerson>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
    setError('')
    setNotice('')
  }

  async function ensureCompany() {
    if (companyId) return companyId
    if (!query) return ''
    if (exactCompany) return exactCompany.id
    const input: CompanyInput = { name: query, industry: '', website: '', phone: '', address: '', summary: '' }
    return remote ? directory.saveCompany(input) : saveCompany(input)
  }

  async function ensureContact(resolvedCompanyId: string, draft: DraftPerson, known: Contact[]) {
    const typed = draft.name.trim()
    if (!typed) return ''
    const existing = known.find((contact) => contact.companyId === resolvedCompanyId && sameName(contact.name, typed))
    if (existing) return existing.id
    const input: ContactInput = {
      companyId: resolvedCompanyId,
      name: typed,
      department: draft.department,
      position: draft.position,
      email: '',
      phone: '',
      memo: '',
    }
    const id = remote ? await directory.saveContact(input) : saveContact(input)
    known.push({ ...input, id })
    return id
  }

  async function register() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const resolvedCompanyId = await ensureCompany()
      if (!resolvedCompanyId) {
        setError('고객사를 선택하거나 입력해 주세요.')
        return
      }
      const known = [...contacts]
      const people: { id: string; name: string }[] = []
      for (const id of contactIds) {
        const person = known.find((contact) => contact.id === id)
        if (person && !people.some((item) => item.id === person.id)) people.push({ id: person.id, name: person.name })
      }
      for (const draft of drafts) {
        const id = await ensureContact(resolvedCompanyId, draft, known)
        if (!id || people.some((person) => person.id === id)) continue
        const person = known.find((contact) => contact.id === id)
        people.push({ id, name: draft.name.trim() || person?.name || '상담회' })
      }
      if (people.length === 0) {
        setError('담당자를 한 명 이상 선택하거나 입력해 주세요.')
        return
      }
      const fresh = people.filter(
        (person) =>
          !db.activities.some(
            (activity) =>
              isEventAttendance(activity) &&
              activity.eventId === eventId &&
              activity.companyId === resolvedCompanyId &&
              activity.contactIds.includes(person.id),
          ),
      )
      if (fresh.length === 0) {
        setError('선택한 담당자는 이 행사에 이미 등록되어 있습니다.')
        return
      }
      const companyName = companies.find((company) => company.id === resolvedCompanyId)?.name ?? query
      for (const person of fresh) {
        saveActivity({
          date: eventDate || todayKey(),
          type: 'event',
          title: autoTitle({ type: 'event', companyName, purposeLabel: person.name }),
          companyId: resolvedCompanyId,
          contactIds: [person.id],
          eventId,
          purpose: 'consult',
          status: defaultStatus(eventDate || todayKey()),
          notes: note.trim(),
          opinion: opinion.trim(),
          relatedActivityId: null,
        })
      }
      setCompanyId(null)
      setCompanyQuery('')
      setContactIds([])
      setDrafts([])
      setNote('')
      setOpinion('')
      setError('')
      setNotice(
        fresh.length < people.length
          ? `담당자 ${fresh.length}명을 추가했습니다. 이미 등록된 담당자는 제외했습니다.`
          : `담당자 ${fresh.length}명을 추가했습니다. 다른 고객사도 이어서 등록할 수 있습니다.`,
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  function beginEdit(activity: Activity, contactId: string, contact: Contact | undefined) {
    setEditingId(`${activity.id}:${contactId || 'company'}`)
    setEditNote(activity.notes)
    setEditOpinion(activity.opinion ?? '')
    setEditName(contact?.name ?? '')
    setEditDepartment(contact?.department ?? '')
    setEditPosition(contact?.position ?? '')
    setError('')
  }

  async function saveParticipant(activity: Activity, contactId: string) {
    const name = editName.trim()
    if (contactId && !name) {
      setError('담당자명을 입력해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (contactId) {
        const current = findContact(contactId)
        if (current) {
          const next = { ...current, name, department: editDepartment.trim(), position: editPosition.trim() }
          const sharedContact = contacts.some((item) => item.id === contactId)
          if (remote && sharedContact) await directory.saveContact(next)
          else saveContact(next)
        }
      }
      const companyName = companies.find((item) => item.id === activity.companyId)?.name
      const shared = {
        date: activity.date,
        type: activity.type,
        companyId: activity.companyId,
        eventId: activity.eventId,
        purpose: activity.purpose,
        status: activity.status,
        startTime: activity.startTime,
        endTime: activity.endTime,
        businessId: activity.businessId,
      }
      if (activity.contactIds.length <= 1) {
        saveActivity({
          ...shared,
          id: activity.id,
          contactIds: contactId ? [contactId] : activity.contactIds,
          title: contactId ? autoTitle({ type: 'event', companyName, purposeLabel: name || '상담회' }) : activity.title,
          notes: editNote.trim(),
          opinion: editOpinion.trim(),
          relatedActivityId: activity.relatedActivityId,
        })
      } else if (contactId) {
        saveActivity({
          ...shared,
          id: activity.id,
          contactIds: activity.contactIds.filter((id) => id !== contactId),
          title: activity.title,
          notes: activity.notes,
          opinion: activity.opinion,
          relatedActivityId: activity.relatedActivityId,
        })
        saveActivity({
          ...shared,
          contactIds: [contactId],
          title: autoTitle({ type: 'event', companyName, purposeLabel: name || '상담회' }),
          notes: editNote.trim(),
          opinion: editOpinion.trim(),
          relatedActivityId: null,
        })
      }
      setEditingId(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  function removeParticipant(activity: Activity, contactId: string, name?: string) {
    const label = name ? `${name} 님을` : '이 담당자를'
    if (!window.confirm(`${label} 이 행사 참여 목록에서 제외할까요? 고객사와 담당자 정보는 그대로 남습니다.`)) return
    if (!contactId || activity.contactIds.length <= 1) {
      deleteActivity(activity.id)
      return
    }
    saveActivity({
      id: activity.id,
      date: activity.date,
      type: activity.type,
      title: activity.title,
      companyId: activity.companyId,
      contactIds: activity.contactIds.filter((id) => id !== contactId),
      eventId: activity.eventId,
      purpose: activity.purpose,
      status: activity.status,
      notes: activity.notes,
      opinion: activity.opinion,
      startTime: activity.startTime,
      endTime: activity.endTime,
      relatedActivityId: activity.relatedActivityId,
      businessId: activity.businessId,
    })
  }

  if (remote && !directory.ready) {
    return (
      <section className="card pad stack-top">
        <p className="empty">고객사 정보를 불러오고 있습니다.</p>
      </section>
    )
  }

  return (
    <section className="card pad stack-top">
      <div className="form-block-head">
        <h2>참여 고객</h2>
        <p>행사에서 만난 고객사와 담당자를 여러 명 등록할 수 있습니다. 이미 등록된 정보는 다시 만들지 않습니다.</p>
      </div>
      <div className="form-section">
        <h3>고객사 선택</h3>
        {selectedCompany ? (
          <div className="selected-line">
            <span className="quick-pick on">{selectedCompany.name}</span>
            <button type="button" className="text-btn" onClick={clearCompany}>
              변경
            </button>
          </div>
        ) : (
          <>
            <Field label="고객사 검색">
              <input
                className="input"
                value={companyQuery}
                placeholder="고객사명 검색 또는 새 고객사명"
                onChange={(event) => {
                  setCompanyQuery(event.target.value)
                  setError('')
                }}
              />
            </Field>
            <div className="menu">
              {matches.map((company) => (
                <button key={company.id} type="button" onClick={() => chooseCompany(company.id)}>
                  <span>{company.name}</span>
                  {company.industry && <span className="hint">{company.industry}</span>}
                </button>
              ))}
            </div>
            {query && !exactCompany && <p className="hint">같은 이름의 고객사가 없으면 입력한 이름으로 새로 등록됩니다.</p>}
          </>
        )}
      </div>
      {(selectedCompany || query) && (
        <div className="form-section">
          <h3>담당자 선택</h3>
          {companyContacts.length > 0 && (
            <>
              <input
                className="input"
                value={contactFilter}
                placeholder="담당자 검색"
                onChange={(event) => setContactFilter(event.target.value)}
              />
              <div className="menu">
                {companyContacts
                  .filter((contact) => {
                    const needle = contactFilter.trim()
                    if (!needle) return true
                    return `${contact.name} ${contact.position} ${contact.department}`.includes(needle)
                  })
                  .map((contact) => {
                    const selected = contactIds.includes(contact.id)
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        className={selected ? 'on' : ''}
                        aria-pressed={selected}
                        onClick={() => toggleContact(contact.id)}
                      >
                        <span>{[contact.name, contact.position, contact.department].filter(Boolean).join(' · ')}</span>
                        {selected && <span>선택됨</span>}
                      </button>
                    )
                  })}
              </div>
            </>
          )}
          <div className="person-drafts">
            {drafts.map((draft, index) => (
              <div key={draft.key} className="person-draft">
                <div className="form-grid">
                  <Field label={index === 0 ? '담당자명' : `담당자명 ${index + 1}`}>
                    <input className="input" value={draft.name} onChange={(event) => patchDraft(draft.key, { name: event.target.value })} />
                  </Field>
                  <Field label="직책">
                    <input className="input" value={draft.position} onChange={(event) => patchDraft(draft.key, { position: event.target.value })} />
                  </Field>
                  <Field label="부서" wide>
                    <input className="input" value={draft.department} onChange={(event) => patchDraft(draft.key, { department: event.target.value })} />
                  </Field>
                </div>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                >
                  이 담당자 지우기
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="text-btn follow-btn" onClick={() => setDrafts((current) => [...current, blankPerson()])}>
            담당자 추가
          </button>
          <p className="hint">담당자는 여러 명 선택할 수 있습니다. 직접 입력한 이름은 같은 고객사에 없을 때만 새로 등록됩니다.</p>
        </div>
      )}
      <div className="form-section">
        <h3>상담 기록</h3>
        <div className="form-grid">
          <Field label="상담 내용">
            <textarea className="textarea" value={note} placeholder="행사에서 나눈 상담 내용" onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Field label="기타 소견">
            <textarea className="textarea" value={opinion} placeholder="관심사, 후속 가능성, 참고할 점" onChange={(event) => setOpinion(event.target.value)} />
          </Field>
        </div>
        <p className="hint">여러 명을 한 번에 등록하면 같은 내용이 담당자별로 기록됩니다. 등록 후 각자 수정할 수 있습니다.</p>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && !error && <p className="hint">{notice}</p>}
      <button type="button" className="btn primary" onClick={register} disabled={saving}>
        {saving ? '저장 중' : '참여 고객 등록'}
      </button>
      <div className="participant-list">
        <h3>참여 담당자</h3>
        <p className="hint">달력에는 행사명만 표시됩니다. 만난 고객사와 담당자는 이 목록에서 확인합니다.</p>
        {participantGroups.size > 0 && (
          <p className="hint">
            고객사 {participantGroups.size}곳 · 담당자 {participants.filter((row) => row.contactId).length}명
          </p>
        )}
        {participantGroups.size === 0 && <p className="empty">등록된 참여 담당자가 없습니다.</p>}
        {[...participantGroups.entries()].map(([companyKey, rows]) => (
          <div key={companyKey} className="participant">
            <button
              type="button"
              className="text-btn"
              onClick={() => rows[0]?.company && go({ name: 'company', id: rows[0].company.id })}
              disabled={!rows[0]?.company}
            >
              {rows[0]?.company?.name ?? '고객사'}
            </button>
            {rows.map((row) => {
              const rowKey = `${row.activity.id}:${row.contactId || 'company'}`
              const open = editingId === rowKey
              return (
                <article key={rowKey} className="participant-card">
                  {open ? (
                    <div className="form-grid">
                      <Field label="담당자명">
                        <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} />
                      </Field>
                      <Field label="직책">
                        <input className="input" value={editPosition} onChange={(event) => setEditPosition(event.target.value)} />
                      </Field>
                      <Field label="부서" wide>
                        <input className="input" value={editDepartment} onChange={(event) => setEditDepartment(event.target.value)} />
                      </Field>
                      <Field label="상담 내용" wide>
                        <textarea className="textarea" value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                      </Field>
                      <Field label="기타 소견" wide>
                        <textarea className="textarea" value={editOpinion} onChange={(event) => setEditOpinion(event.target.value)} />
                      </Field>
                      <div className="button-row">
                        <button type="button" className="btn primary" onClick={() => void saveParticipant(row.activity, row.contactId)} disabled={saving}>
                          {saving ? '저장 중' : '저장'}
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setEditingId(null)}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="biz-entity-top">
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => row.contact && go({ name: 'contact', id: row.contact.id })}
                          disabled={!row.contact}
                        >
                          <strong>
                            {row.contact
                              ? [row.contact.name, row.contact.position, row.contact.department].filter(Boolean).join(' · ')
                              : '담당자 정보 없음'}
                          </strong>
                        </button>
                        <span className="participant-actions">
                          <button type="button" className="text-btn" onClick={() => beginEdit(row.activity, row.contactId, row.contact)}>
                            수정
                          </button>
                          <button type="button" className="text-btn danger" onClick={() => removeParticipant(row.activity, row.contactId, row.contact?.name)}>
                            제외
                          </button>
                        </span>
                      </div>
                      <p className="participant-note">
                        <span>상담 내용</span>
                        {row.activity.notes.trim() || '기록이 없습니다.'}
                      </p>
                      <p className="participant-note">
                        <span>기타 소견</span>
                        {row.activity.opinion.trim() || '기록이 없습니다.'}
                      </p>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        ))}
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
          const people = linked.filter((activity) => isEventAttendance(activity))
          const companyCount = new Set(people.map((activity) => activity.companyId).filter(Boolean)).size
          const contactCount = new Set(people.flatMap((activity) => activity.contactIds)).size
          return (
            <button key={event.id} type="button" className="entity" onClick={() => go({ name: 'event', id: event.id })}>
              <strong>{event.name}</strong>
              <span>{[formatFullDate(event.startDate), event.place].filter(Boolean).join(' · ')}</span>
              <span>
                후속 영업활동 {linked.length - people.length}건 · 고객사 {companyCount}곳 · 담당자 {contactCount}명
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function EventDetail({ id }: { id: string }) {
  const { db, saveEvent, deleteEvent } = useCrm()
  const { go, openCreate } = useUI()
  const eventItem = db.events.find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EventInput>({ name: '', startDate: '', endDate: '', place: '', memo: '' })
  const [error, setError] = useState('')

  if (!eventItem) return <Missing text="행사를 찾지 못했습니다." onBack={() => go({ name: 'events' })} />

  const activities = db.activities.filter((activity) => activity.eventId === eventItem.id && !isEventAttendance(activity))

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

  function removeEvent() {
    if (!eventItem) return
    if (!window.confirm(`${eventItem.name} 행사를 삭제할까요? 이 행사에서 만난 담당자 기록도 함께 지워집니다. 고객사, 담당자, 이후 미팅과 메일은 남습니다.`)) return
    deleteEvent(eventItem.id)
    go({ name: 'events' })
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
            onClick={() => openCreate({ date: todayKey(), eventId: eventItem.id })}
          >
            + 후속 영업활동
          </button>
        </div>
        {eventItem.memo && <p className="summary">{eventItem.memo}</p>}
        <div className="button-row">
          {!editing && (
            <button type="button" className="text-btn" onClick={startEdit}>
              행사 정보 수정
            </button>
          )}
          <button type="button" className="text-btn danger" onClick={removeEvent}>
            행사 삭제
          </button>
        </div>
        {error && !editing && <p className="error">{error}</p>}
        {editing && (
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
      <EventPeople eventId={eventItem.id} eventDate={eventItem.startDate} />
      <section className="card pad stack-top">
        <h2>후속 영업활동</h2>
        <Timeline activities={activities} empty="행사 이후 등록한 미팅이나 메일이 없습니다." />
      </section>
    </section>
  )
}
