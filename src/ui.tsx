import { createContext, useContext } from 'react'
import type { CreatePrefill } from './types'

export type Route =
  | { name: 'calendar' }
  | { name: 'companies' }
  | { name: 'company'; id: string }
  | { name: 'contacts' }
  | { name: 'contact'; id: string }
  | { name: 'events' }
  | { name: 'event'; id: string }
  | { name: 'search'; q?: string }

interface UI {
  route: Route
  go: (route: Route) => void
  openCreate: (prefill: CreatePrefill) => void
  openEdit: (activityId: string) => void
  openFollowup: (activityId: string) => void
}

export const UIContext = createContext<UI | null>(null)

export function useUI() {
  const value = useContext(UIContext)
  if (!value) throw new Error('useUI must be used within UIContext')
  return value
}

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const [pathPart, queryPart] = raw.split('?')
  const params = new URLSearchParams(queryPart ?? '')
  const parts = pathPart.replace(/^\//, '').split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'calendar' }
  if (parts[0] === 'companies' && parts[1]) return { name: 'company', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'companies') return { name: 'companies' }
  if (parts[0] === 'contacts' && parts[1]) return { name: 'contact', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'contacts') return { name: 'contacts' }
  if (parts[0] === 'events' && parts[1]) return { name: 'event', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'events') return { name: 'events' }
  if (parts[0] === 'search') return { name: 'search', q: params.get('q') ?? '' }
  return { name: 'calendar' }
}

export function routeToHash(route: Route) {
  switch (route.name) {
    case 'calendar':
      return '#/'
    case 'companies':
      return '#/companies'
    case 'company':
      return `#/companies/${encodeURIComponent(route.id)}`
    case 'contacts':
      return '#/contacts'
    case 'contact':
      return `#/contacts/${encodeURIComponent(route.id)}`
    case 'events':
      return '#/events'
    case 'event':
      return `#/events/${encodeURIComponent(route.id)}`
    case 'search':
      return route.q ? `#/search?q=${encodeURIComponent(route.q)}` : '#/search'
  }
}

export function sectionOf(route: Route) {
  if (route.name === 'company') return 'companies'
  if (route.name === 'contact') return 'contacts'
  if (route.name === 'event') return 'events'
  return route.name
}
