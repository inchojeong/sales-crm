import { useEffect, useMemo, useState } from 'react'
import { isEventAttendance } from '../attendance'
import { Timeline } from './ActivityRow'
import { useCrm } from '../store'
import { STATUS_META, TYPE_META, TYPE_ORDER, purposeLabel } from '../templates'
import type { ActivityStatus, ActivityType, Contact } from '../types'
import { useUI } from '../ui'

export function SearchScreen() {
  const { db, companyById, contactById, eventById } = useCrm()
  const { route } = useUI()
  const routeQuery = route.name === 'search' ? route.q ?? '' : ''
  const [query, setQuery] = useState(routeQuery)
  const [type, setType] = useState<ActivityType | ''>('')
  const [status, setStatus] = useState<ActivityStatus | ''>('')
  const [companyId, setCompanyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    setQuery(routeQuery)
  }, [routeQuery])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return db.activities.filter((activity) => {
      if (isEventAttendance(activity)) return false
      if (type && activity.type !== type) return false
      if (status && activity.status !== status) return false
      if (companyId && activity.companyId !== companyId) return false
      if (from && activity.date < from) return false
      if (to && activity.date > to) return false
      if (!needle) return true
      const company = activity.companyId ? companyById.get(activity.companyId) : undefined
      const event = activity.eventId ? eventById.get(activity.eventId) : undefined
      const contacts = activity.contactIds
        .map((id) => contactById.get(id))
        .filter((contact): contact is Contact => Boolean(contact))
      const haystack = [
        activity.title,
        activity.notes,
        activity.opinion,
        company?.name,
        event?.name,
        TYPE_META[activity.type].label,
        purposeLabel(activity.type, activity.purpose),
        ...contacts.flatMap((contact) => [contact.name, contact.department, contact.position]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [db.activities, query, type, status, companyId, from, to, companyById, contactById, eventById])

  const companies = [...db.companies].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const filtered = Boolean(query || type || status || companyId || from || to)

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>영업활동 검색</h1>
          <p className="page-intro">고객사, 담당자, 기간으로 영업활동을 조회합니다.</p>
        </div>
        <span className="count-lg">{results.length}건</span>
      </div>
      <div className="card pad form-card">
        <div className="filters">
          <input
            className="input"
            placeholder="고객사, 담당자, 제목, 내용"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="input" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">전체 고객사</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select className="input" value={type} onChange={(event) => setType(event.target.value as ActivityType | '')}>
            <option value="">전체 유형</option>
            {TYPE_ORDER.map((item) => (
              <option key={item} value={item}>
                {TYPE_META[item].label}
              </option>
            ))}
          </select>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value as ActivityStatus | '')}>
            <option value="">전체 상태</option>
            {(Object.keys(STATUS_META) as ActivityStatus[]).map((item) => (
              <option key={item} value={item}>
                {STATUS_META[item].label}
              </option>
            ))}
          </select>
          <input className="input" type="date" aria-label="시작일" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="input" type="date" aria-label="종료일" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        {filtered && (
          <button
            type="button"
            className="text-btn follow-btn"
            onClick={() => {
              setQuery('')
              setType('')
              setStatus('')
              setCompanyId('')
              setFrom('')
              setTo('')
            }}
          >
            조건 초기화
          </button>
        )}
      </div>
      <div className="card pad stack-top">
        <Timeline activities={results} empty="조건에 맞는 영업활동이 없습니다." />
      </div>
    </section>
  )
}
