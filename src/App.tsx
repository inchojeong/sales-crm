import { useEffect, useState } from 'react'
import { ActivityDialog } from './components/ActivityDialog'
import { CalendarScreen } from './components/CalendarScreen'
import { CompanyDetail, CompanyList, ContactDetail, ContactList, EventDetail, EventList } from './components/RecordScreens'
import { SearchScreen } from './components/SearchScreen'
import { Shell } from './components/Shell'
import type { CreatePrefill, DialogRequest } from './types'
import { UIContext, parseHash, routeToHash, type Route } from './ui'

function dialogKey(dialog: DialogRequest) {
  if (dialog.mode === 'create') {
    return `c-${dialog.date}-${dialog.companyId ?? ''}-${(dialog.contactIds ?? []).join(',')}-${dialog.eventId ?? ''}-${dialog.type ?? ''}-${dialog.startTime ?? ''}`
  }
  return `${dialog.mode}-${dialog.activityId}`
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [dialog, setDialog] = useState<DialogRequest | null>(null)

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  function go(next: Route) {
    const hash = routeToHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(next)
  }

  function openCreate(prefill: CreatePrefill) {
    setDialog({ mode: 'create', ...prefill })
  }

  return (
    <UIContext.Provider
      value={{
        route,
        go,
        openCreate,
        openEdit: (activityId) => setDialog({ mode: 'edit', activityId }),
        openFollowup: (activityId) => setDialog({ mode: 'followup', activityId }),
      }}
    >
      <Shell>
        {route.name === 'calendar' && <CalendarScreen />}
        {route.name === 'companies' && <CompanyList />}
        {route.name === 'company' && <CompanyDetail key={route.id} id={route.id} />}
        {route.name === 'contacts' && <ContactList />}
        {route.name === 'contact' && <ContactDetail key={route.id} id={route.id} />}
        {route.name === 'events' && <EventList />}
        {route.name === 'event' && <EventDetail key={route.id} id={route.id} />}
        {route.name === 'search' && <SearchScreen />}
      </Shell>
      {dialog && <ActivityDialog key={dialogKey(dialog)} request={dialog} onClose={() => setDialog(null)} />}
    </UIContext.Provider>
  )
}
