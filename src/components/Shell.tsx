import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { useBusiness } from '../business'
import { useDirectory } from '../directory'
import { useOpportunities } from '../opportunities'
import { supabase } from '../lib/supabase'
import { useCrm } from '../store'
import { sectionOf, useUI, type Route } from '../ui'
import { QuickCapture } from './QuickCapture'

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

const NAV: { id: string; label: string; route: Route; icon: ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', route: { name: 'dashboard' }, icon: <GridIcon /> },
  { id: 'companies', label: '고객', route: { name: 'companies' }, icon: <BuildingIcon /> },
  { id: 'businesses', label: '사업', route: { name: 'businesses' }, icon: <BriefcaseIcon /> },
  { id: 'opportunities', label: '영업기회', route: { name: 'opportunities' }, icon: <TrendIcon /> },
  { id: 'calendar', label: '활동', route: { name: 'calendar' }, icon: <CalendarIcon /> },
]

const SHORTCUTS: { id: string; label: string; route: Route }[] = [
  { id: 'contacts', label: '담당자', route: { name: 'contacts' } },
  { id: 'events', label: '행사', route: { name: 'events' } },
  { id: 'search', label: '검색', route: { name: 'search' } },
]

function readDismissed() {
  try {
    return sessionStorage.getItem('crm-banner-hide') === '1'
  } catch {
    return false
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const { route, go } = useUI()
  const { signOut } = useAuth()
  const { resetDemo, currentUser, scheduleReady, scheduleError, db } = useCrm()
  const directory = useDirectory()
  const portfolio = useBusiness()
  const board = useOpportunities()
  const companyCount = (directory.remote ? directory.companies : db.companies).length
  const counts: Record<string, number> = {
    companies: companyCount,
    businesses: portfolio.businesses.length,
    opportunities: board.opportunities.filter((item) => !item.archived).length,
  }
  const shared = Boolean(supabase)
  const [hidden, setHidden] = useState(readDismissed)
  const [leaving, setLeaving] = useState(false)
  const [query, setQuery] = useState(route.name === 'search' ? route.q ?? '' : '')
  const [quick, setQuick] = useState(false)
  const active = sectionOf(route)
  const ready = !shared || scheduleReady

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (ready) setQuick((value) => !value)
        return
      }
      if (event.key === '/' && ready && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (isTyping(event.target) || document.querySelector('.backdrop')) return
        event.preventDefault()
        setQuick(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  function dismiss() {
    try {
      sessionStorage.setItem('crm-banner-hide', '1')
    } catch {
      /* session storage can be unavailable */
    }
    setHidden(true)
  }

  function reset() {
    if (!window.confirm('예시 데이터로 되돌리면 현재 저장된 기록이 삭제됩니다. 계속할까요?')) return
    resetDemo()
    go({ name: 'dashboard' })
  }

  async function logout() {
    setLeaving(true)
    try {
      await signOut()
    } finally {
      setLeaving(false)
    }
  }

  function search(event: FormEvent) {
    event.preventDefault()
    go({ name: 'search', q: query.trim() })
  }

  return (
    <div className="stage">
      <div className="app-frame">
        <aside className="sidebar">
          <button type="button" className="brand" onClick={() => go({ name: 'dashboard' })}>
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>
              <strong>Business Hub</strong>
              <small>TBELL 사업전략팀</small>
            </span>
          </button>
          <nav className="side-nav" aria-label="주요 메뉴">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={active === item.id ? 'side-link on' : 'side-link'}
                aria-current={active === item.id ? 'page' : undefined}
                onClick={() => go(item.route)}
              >
                {item.icon}
                {item.label}
                {counts[item.id] !== undefined && <span className="nav-count">{counts[item.id]}</span>}
              </button>
            ))}
          </nav>
          <p className="nav-label">바로가기</p>
          <nav className="side-nav" aria-label="바로가기">
            {SHORTCUTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={active === item.id ? 'side-link on' : 'side-link'}
                onClick={() => go(item.route)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {!shared && (
            <div className="side-foot">
              <button type="button" className="text-btn" onClick={reset}>
                예시 데이터로 되돌리기
              </button>
            </div>
          )}
        </aside>
        <div className="workspace">
          <header className="workspace-top">
            <form className="global-search" onSubmit={search}>
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객사, 담당자, 사업, 영업활동 검색"
                aria-label="검색"
              />
            </form>
            <button type="button" className="quick-open" onClick={() => setQuick(true)} disabled={!ready}>
              <span>빠른 입력</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="who">
              <span className="avatar" aria-hidden="true">
                {currentUser.name.slice(0, 1)}
              </span>
              <span className="who-name">{currentUser.name}</span>
            </div>
            {shared && (
              <button type="button" className="btn ghost logout" onClick={() => void logout()} disabled={leaving}>
                {leaving ? '로그아웃 중' : '로그아웃'}
              </button>
            )}
          </header>
          <div className="workspace-body">
            {!shared && !hidden && (
              <div className="banner">
                <p>현재는 예시 데이터로 확인할 수 있습니다. 팀 공유 기능은 추후 제공됩니다.</p>
                <button type="button" className="text-btn" onClick={dismiss}>
                  닫기
                </button>
              </div>
            )}
            {scheduleError ? <p className="error">{scheduleError}</p> : null}
            {shared && !scheduleReady ? <p className="empty">일정을 불러오고 있습니다.</p> : children}
          </div>
        </div>
      </div>
      {quick && ready && <QuickCapture onClose={() => setQuick(false)} />}
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function TrendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18l5-6 4 3 7-9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h5v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 10h16M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V6.5L12 3l8 3.5V20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 20v-5h6v5M9 9h.01M12 9h.01M15 9h.01M9 13h.01M12 13h.01M15 13h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16.5L20 20.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
