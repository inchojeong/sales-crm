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
  const review = companies.filter((item) => item.needsReview).slice(0, 4)
  const outcomes = portfolio.businesses.reduce<Record<string, number>>((sum, item) => {
    sum[item.outcome] = (sum[item.outcome] ?? 0) + 1
    return sum
  }, {})
  const openOpps = board.opportunities.filter((item) => !item.archived)
  const weekAhead = activities.filter((item) => item.date >= today && item.date <= addDays(today, 6))

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
          <span>고객</span>
          <strong>{companies.length}</strong>
          <small>기업·기관</small>
        </button>
        <button type="button" className="card hub-kpi" onClick={() => go({ name: 'businesses' })}>
          <span>사업 이력</span>
          <strong>{portfolio.businesses.length}</strong>
          <small>수행 중 {outcomes.running ?? 0} · 확인 필요 {outcomes.unknown ?? 0}</small>
        </button>
        <button type="button" className="card hub-kpi" onClick={() => go({ name: 'opportunities' })}>
          <span>영업기회</span>
          <strong>{openOpps.length}</strong>
          <small>진행 중인 카드</small>
        </button>
      </div>
      <div className="hub-split">
        <div className="card">
          <div className="card-h"><h3>오늘 일정</h3><button type="button" className="text-btn" onClick={() => go({ name: 'calendar' })}>활동 달력</button></div>
          <div className="card-b">
            {todayItems.length === 0 && <p className="empty">오늘 등록된 일정이 없습니다.</p>}
            {todayItems.map((item) => (
              <button key={item.id} type="button" className="hub-row" onClick={() => openEdit(item.id)}>
                <b>{item.title}</b>
                <span>{[item.startTime?.slice(0, 5), STATUS_META[item.status].label].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>영업 파이프라인</h3></div>
          <div className="card-b hub-funnel">
            {OPPORTUNITY_STAGES.map((stage) => {
              const count = openOpps.filter((item) => item.stage === stage.id).length
              const width = openOpps.length === 0 ? 0 : Math.max(8, Math.round((count / openOpps.length) * 100))
              return (
                <div key={stage.id} className="hub-funnel-row">
                  <span>{stage.label}</span>
                  <i><b style={{ width: `${count === 0 ? 0 : width}%` }} /></i>
                  <strong>{count}</strong>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="hub-split">
        <div className="card">
          <div className="card-h"><h3>검토가 필요한 고객</h3></div>
          <div className="card-b">
            {review.length === 0 && <p className="empty">검토 표시가 있는 고객이 없습니다.</p>}
            {review.map((company) => (
              <button key={company.id} type="button" className="hub-row" onClick={() => go({ name: 'company', id: company.id })}>
                <b>{company.name}</b>
                <span>{company.reviewNote || company.relation || '검토 필요'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>최근 활동</h3></div>
          <div className="card-b">
            {recent.map((item) => (
              <button key={item.id} type="button" className="hub-row" onClick={() => openEdit(item.id)}>
                <b>{item.title}</b>
                <span>{formatDayTitle(item.date)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
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
                    <span>{item.nextDate ? formatDayTitle(item.nextDate) : opportunityStageLabel(item.stage)}</span>
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
