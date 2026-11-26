import { useState } from 'react'
import { isEventAttendance } from '../attendance'
import { useBusiness } from '../business'
import { formatDayTitle, formatFullDate, todayKey } from '../dates'
import { useDirectory } from '../directory'
import { OPPORTUNITY_STAGES, opportunityStageLabel, useOpportunities, type OpportunityStage } from '../opportunities'
import { useCrm } from '../store'
import { STATUS_META } from '../templates'
import { useUI } from '../ui'

export function Dashboard() {
  const { db, currentUser } = useCrm()
  const directory = useDirectory()
  const portfolio = useBusiness()
  const board = useOpportunities()
  const { go, openEdit } = useUI()
  const remote = directory.remote
  const companies = remote ? directory.companies : db.companies
  const today = todayKey()
  const activities = db.activities.filter((item) => !isEventAttendance(item))
  const todayItems = activities.filter((item) => item.date === today).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  const recent = [...activities].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5)
  const outcomes = portfolio.businesses.reduce<Record<string, number>>((sum, item) => {
    sum[item.outcome] = (sum[item.outcome] ?? 0) + 1
    return sum
  }, {})
  const openOpps = board.opportunities.filter((item) => !item.archived)
  const weekAhead = activities.filter((item) => item.date >= today && item.date <= addDays(today, 6))
  const touched = companies.filter((company) => activities.some((item) => item.companyId === company.id)).length
  const reviewCount = companies.filter((company) => company.needsReview).length
  const quiet = Math.max(companies.length - touched, 0)
  const won = (outcomes.selected ?? 0) + (outcomes.running ?? 0) + (outcomes.completed ?? 0)
  const pending = (outcomes.unknown ?? 0) + (outcomes.applied ?? 0)
  const closed = (outcomes.not_selected ?? 0) + (outcomes.dropped ?? 0)
  const meetings = weekAhead.filter((item) => item.type === 'meeting' || item.type === 'call').length
  const events = weekAhead.filter((item) => item.type === 'event').length
  const followUps = Math.max(weekAhead.length - meetings - events, 0)
  const funnelMax = Math.max(1, ...OPPORTUNITY_STAGES.map((stage) => openOpps.filter((item) => item.stage === stage.id).length))
  const revisit = [...companies]
    .sort((a, b) => lastTouch(activities, a.id).localeCompare(lastTouch(activities, b.id)) || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 3)

  return (
    <section className="hub">
      <div className="page-head">
        <div>
          <p className="hub-eyebrow">{formatFullDate(today)}</p>
          <h1>안녕하세요, {currentUser.name}님</h1>
          <p className="page-intro">오늘 일정 {todayItems.length}건, 이번 주 영업활동 {weekAhead.length}건이 있습니다.</p>
        </div>
      </div>
      <div className="hub-kpis">
        <button type="button" className="card hub-kpi" onClick={() => go({ name: 'companies' })}>
          <div className="kpi-top">고객 현황<span className="kpi-ico lime">사</span></div>
          <div className="kpi-num">{companies.length}<small>개 기업·기관</small></div>
          <div className="stack-bar">{segments(touched, reviewCount, quiet)}</div>
          <div className="kpi-row"><div><b>{touched}</b>접점 있음</div><div><b>{reviewCount}</b>검토</div><div><b>{quiet}</b>접점 없음</div></div>
        </button>
        <button type="button" className="card hub-kpi" onClick={() => go({ name: 'businesses' })}>
          <div className="kpi-top">사업 현황<span className="kpi-ico peri">사</span></div>
          <div className="kpi-num">{portfolio.businesses.length}<small>건 사업 이력</small></div>
          <div className="stack-bar">{segments(won, pending, closed, ['#9fd11f', '#3fcfbd', '#c3c9c5'])}</div>
          <div className="kpi-row"><div><b>{won}</b>선정·수행</div><div><b>{pending}</b>확인·신청</div><div><b>{closed}</b>미선정·중단</div></div>
        </button>
        <button type="button" className="card hub-kpi" onClick={() => go({ name: 'opportunities' })}>
          <div className="kpi-top">이번 주 활동<span className="kpi-ico amber">활</span></div>
          <div className="kpi-num">{weekAhead.length}<small>건</small></div>
          <div className="stack-bar">{segments(meetings, events, followUps, ['#3fcfbd', '#7d86d9', '#f0b429'])}</div>
          <div className="kpi-row"><div><b>{meetings}</b>미팅</div><div><b>{events}</b>행사</div><div><b>{followUps}</b>후속</div></div>
        </button>
      </div>
      <div className="hub-split">
        <div className="card">
          <div className="card-h"><h3>오늘 할 일</h3><button type="button" className="text-btn" onClick={() => go({ name: 'calendar' })}>활동 달력</button></div>
          <div className="card-b">
            {todayItems.length === 0 && <p className="empty">오늘 등록된 일정이 없습니다.</p>}
            {todayItems.map((item) => (
              <button key={item.id} type="button" className="todo" onClick={() => openEdit(item.id)}>
                <span className="chk" aria-hidden="true" />
                <span className="todo-main"><b>{item.title}</b><span>{STATUS_META[item.status].label}</span></span>
                <span className="due">{item.startTime ? item.startTime.slice(0, 5) : '오늘'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>영업 파이프라인</h3><button type="button" className="text-btn" onClick={() => go({ name: 'opportunities' })}>칸반으로 보기</button></div>
          <div className="card-b hub-funnel">
            {OPPORTUNITY_STAGES.map((stage) => {
              const count = openOpps.filter((item) => item.stage === stage.id).length
              return (
                <div key={stage.id} className="hub-funnel-row">
                  <span>{stage.label}</span>
                  <i><b style={{ width: `${Math.round((count / funnelMax) * 100)}%` }} /></i>
                  <strong>{count}</strong>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="hub-split">
        <div className="card">
          <div className="card-h"><h3>다시 연락할 만한 고객</h3></div>
          <div className="card-b">
            {revisit.length === 0 && <p className="empty">등록된 고객이 없습니다.</p>}
            {revisit.map((company) => {
              const tone = markTone(company.name)
              const last = lastTouch(activities, company.id)
              return (
                <button key={company.id} type="button" className="hist" onClick={() => go({ name: 'company', id: company.id })}>
                  <span className="logo" style={{ background: tone.bg, color: tone.fg }}>{company.name.slice(0, 1)}</span>
                  <span><b>{company.name}</b><span>{last ? `최근 ${formatDayTitle(last)}` : '아직 접점 없음'}</span></span>
                  {company.needsReview ? <em className="badge b-warn">검토</em> : <em className="badge b-off">{company.relation || '고객'}</em>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>최근 활동</h3></div>
          <div className="card-b">
            {recent.length === 0 && <p className="empty">등록된 활동이 없습니다.</p>}
            <div className="hub-timeline">
              {recent.map((item) => (
                <button key={item.id} type="button" className={`tl tl-${item.type}`} onClick={() => openEdit(item.id)}>
                  <b>{item.title}</b>
                  <span>{formatDayTitle(item.date)}{item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const MARKS = [
  { bg: '#e2e4f5', fg: '#343b80' },
  { bg: '#d3f1ec', fg: '#0b5a51' },
  { bg: '#e5f3b8', fg: '#41590a' },
  { bg: '#f8e8bd', fg: '#6b4a00' },
  { bg: '#f7d9d5', fg: '#86271f' },
]

export function markTone(name: string) {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return MARKS[code % MARKS.length]
}

function lastTouch(activities: { companyId?: string | null; date: string }[], companyId: string) {
  return activities.filter((item) => item.companyId === companyId).map((item) => item.date).sort().at(-1) ?? ''
}

function segments(a: number, b: number, c: number, colors = ['#3fcfbd', '#bfe83a', '#c3c9c5']) {
  const total = a + b + c
  const width = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100))
  return (
    <>
      <i style={{ width: `${width(a)}%`, background: colors[0] }} />
      <i style={{ width: `${width(b)}%`, background: colors[1] }} />
      <i style={{ width: `${width(c)}%`, background: colors[2] }} />
    </>
  )
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function OpportunityBoard() {
  const board = useOpportunities()
  const { db } = useCrm()
  const { go } = useUI()
  const [title, setTitle] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const directory = useDirectory()
  const companies = directory.remote ? directory.companies : db.companies
  const open = board.opportunities.filter((item) => !item.archived)

  async function add() {
    if (!title.trim() || !companyId) {
      setError('고객사와 제목을 입력해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await board.save({ companyId, title: title.trim(), stage: 'discovery' })
      setTitle('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function drop(stage: OpportunityStage, id: string) {
    setError('')
    try {
      await board.move(id, stage)
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : '단계를 바꾸지 못했습니다.')
    }
  }

  return (
    <section className="hub">
      <div className="page-head">
        <div>
          <h1>영업기회</h1>
          <p className="page-intro">카드를 끌어 단계를 옮깁니다. 고객사 상세에서 이어서 수정할 수 있습니다.</p>
        </div>
      </div>
      {!board.available && <p className="empty">영업기회 항목이 아직 준비되지 않았습니다. portfolio.sql 실행 후 새로고침해 주세요.</p>}
      {board.error && <p className="error">{board.error}</p>}
      <div className="card pad hub-add">
        <select className="input" aria-label="고객사" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">고객사 선택</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>
        <input className="input" aria-label="기회 제목" placeholder="예: 스마트공장 후보" value={title} onChange={(event) => setTitle(event.target.value)} />
        <button type="button" className="btn primary" disabled={saving || !board.available} onClick={() => void add()}>
          {saving ? '저장 중' : '+ 기회 등록'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kanban">
        {OPPORTUNITY_STAGES.map((stage) => (
          <div
            key={stage.id}
            className="kanban-col"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const id = event.dataTransfer.getData('text/plain')
              if (id) void drop(stage.id, id)
            }}
          >
            <div className="kanban-h">{stage.label}<span>{open.filter((item) => item.stage === stage.id).length}</span></div>
            {open.filter((item) => item.stage === stage.id).map((item) => {
              const company = companies.find((entry) => entry.id === item.companyId)
              return (
                <article key={item.id} className="kanban-card" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}>
                  <small>{company?.name ?? '고객사 없음'}</small>
                  <b>{item.title}</b>
                  <div className="kanban-f">
                    <span className="badge b-off">{item.nextDate ? formatDayTitle(item.nextDate) : opportunityStageLabel(item.stage)}</span>
                    {company && (
                      <button type="button" className="text-btn" onClick={() => go({ name: 'company', id: company.id })}>
                        고객
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
