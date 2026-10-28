import { useState, type FormEvent, type ReactNode } from 'react'
import { useCrm } from '../store'
import { sectionOf, useUI, type Route } from '../ui'

const NAV: { id: string; label: string; route: Route; icon: ReactNode }[] = [
  { id: 'calendar', label: '캘린더', route: { name: 'calendar' }, icon: <CalendarIcon /> },
  { id: 'companies', label: '고객사', route: { name: 'companies' }, icon: <BuildingIcon /> },
  { id: 'contacts', label: '담당자', route: { name: 'contacts' }, icon: <PeopleIcon /> },
  { id: 'events', label: '행사', route: { name: 'events' }, icon: <FlagIcon /> },
  { id: 'businesses', label: '사업', route: { name: 'businesses' }, icon: <BriefcaseIcon /> },
  { id: 'search', label: '검색', route: { name: 'search' }, icon: <SearchIcon /> },
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
  const { resetDemo, currentUser } = useCrm()
  const [hidden, setHidden] = useState(readDismissed)
  const [query, setQuery] = useState(route.name === 'search' ? route.q ?? '' : '')
  const active = sectionOf(route)

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
    go({ name: 'calendar' })
  }

  function search(event: FormEvent) {
    event.preventDefault()
    go({ name: 'search', q: query.trim() })
  }

  return (
    <div className="stage">
      <div className="app-frame">
        <aside className="sidebar">
          <button type="button" className="brand" onClick={() => go({ name: 'calendar' })}>
            <span className="brand-mark" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span>
              <strong>영업활동</strong>
              <small>사업전략팀</small>
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
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <button type="button" className="text-btn" onClick={reset}>
              예시 데이터로 되돌리기
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="workspace-top">
            <form className="global-search" onSubmit={search}>
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객사, 담당자, 영업활동 검색"
                aria-label="검색"
              />
            </form>
            <div className="who">
              <span className="avatar" aria-hidden="true">
                데
              </span>
              <span className="who-name">{currentUser.name}</span>
            </div>
          </header>
          <div className="workspace-body">
            {!hidden && (
              <div className="banner">
                <p>현재는 예시 데이터로 확인할 수 있습니다. 팀 공유 기능은 추후 제공됩니다.</p>
                <button type="button" className="text-btn" onClick={dismiss}>
                  닫기
                </button>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
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

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 19c.6-2.8 2.8-4.2 5.5-4.2s4.9 1.4 5.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16.2 14.8c1.8.2 3.3 1.2 4 3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4v16M6 5h10l-2 3.5L16 12H6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
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
