import { useBusiness } from '../business'
import { formatDayTitle, formatFullDate } from '../dates'
import { useDirectory } from '../directory'
import { STATUS_META, TYPE_META, purposeLabel } from '../templates'
import type { Activity, Contact } from '../types'
import { useCrm } from '../store'
import { useUI } from '../ui'

function contactText(contacts: Contact[]) {
  if (contacts.length === 0) return ''
  const first = `${contacts[0].name} ${contacts[0].position}`.trim()
  return contacts.length === 1 ? first : `${first} 외 ${contacts.length - 1}명`
}

export function ActivityRow({ activity }: { activity: Activity }) {
  const { contactById } = useCrm()
  const directory = useDirectory()
  const { openEdit } = useUI()
  const portfolio = useBusiness()
  const businessName = activity.businessId
    ? portfolio.businesses.find((item) => item.id === activity.businessId)?.name
    : undefined
  const contacts = activity.contactIds
    .map((id) => contactById.get(id) ?? directory.contacts.find((contact) => contact.id === id))
    .filter((contact): contact is Contact => Boolean(contact))
  const meta = [TYPE_META[activity.type].label, purposeLabel(activity.type, activity.purpose)]
  if (!activity.companyId) meta.push('내부 활동')
  const people = contactText(contacts)
  if (people) meta.push(people)
  if (businessName) meta.push(businessName)

  return (
    <button type="button" className="arow" onClick={() => openEdit(activity.id)}>
      <span className="aicon" aria-hidden="true">
        <CalendarGlyph />
      </span>
      <span className="arow-body">
        <span className="arow-title">{activity.title}</span>
        <span className="arow-meta">{meta.filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`tag tag-${activity.status}`}>{STATUS_META[activity.status].label}</span>
    </button>
  )
}

export function RelationTimeline({ activities, empty }: { activities: Activity[]; empty?: string }) {
  const { contactById, eventById } = useCrm()
  const directory = useDirectory()
  const portfolio = useBusiness()
  const { openEdit } = useUI()
  const sorted = [...activities].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
  if (sorted.length === 0) return <p className="empty">{empty ?? '등록된 영업활동이 없습니다.'}</p>

  return (
    <div className="rel-list">
      {sorted.map((activity) => {
        const contacts = activity.contactIds
          .map((id) => contactById.get(id) ?? directory.contacts.find((contact) => contact.id === id))
          .filter((contact): contact is Contact => Boolean(contact))
        const eventName = activity.eventId ? eventById.get(activity.eventId)?.name : undefined
        const label = activity.type === 'event' && eventName ? eventName : purposeLabel(activity.type, activity.purpose) || TYPE_META[activity.type].label
        const person = relationPerson(contacts)
        const businessName = activity.businessId
          ? portfolio.businesses.find((item) => item.id === activity.businessId)?.name
          : undefined
        const who = [person, businessName].filter(Boolean).join(' · ')
        return (
          <button key={activity.id} type="button" className="rel-item" onClick={() => openEdit(activity.id)}>
            <span className="rel-icon" aria-hidden="true">
              <TypeGlyph type={activity.type} />
            </span>
            <span className="rel-body">
              <span className="rel-title">
                <strong>
                  {formatDayTitle(activity.date)} · {label}
                </strong>
                {activity.status !== 'done' && <span className={`tag tag-${activity.status}`}>{STATUS_META[activity.status].label}</span>}
              </span>
              {who && <span className="rel-who">{who}</span>}
              {activity.notes.trim() && <span className="rel-note">{activity.notes}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function relationPerson(contacts: Contact[]) {
  if (contacts.length === 0) return ''
  const first = contacts[0]
  const who = [first.name, first.position].filter(Boolean).join(' ')
  const line = [who, first.department].filter(Boolean).join(' · ')
  return contacts.length === 1 ? line : `${line} 외 ${contacts.length - 1}명`
}

function TypeGlyph({ type }: { type: Activity['type'] }) {
  if (type === 'email') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.2 4.2 8 8.4l5.8-4.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'call') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M4.2 2.6h2.1l1 2.4-1.3 1.1a8.4 8.4 0 0 0 3.9 3.9l1.1-1.3 2.4 1v2.1c0 .6-.5 1.2-1.2 1.2A9.2 9.2 0 0 1 3 3.8c0-.7.6-1.2 1.2-1.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'meeting') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="6" cy="5.2" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="10.6" cy="5.6" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.8 12.2c.4-1.8 1.7-2.8 3.2-2.8s2.8 1 3.2 2.8M9.2 9.6c.8-.4 1.7-.5 2.4-.2 1 .4 1.6 1.4 1.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  return <CalendarGlyph />
}

export function Timeline({ activities, empty }: { activities: Activity[]; empty?: string }) {
  const sorted = [...activities].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
  if (sorted.length === 0) return <p className="empty">{empty ?? '해당하는 영업활동이 없습니다.'}</p>

  const groups: { date: string; items: Activity[] }[] = []
  for (const activity of sorted) {
    const last = groups[groups.length - 1]
    if (last?.date === activity.date) last.items.push(activity)
    else groups.push({ date: activity.date, items: [activity] })
  }

  return (
    <div className="timeline">
      {groups.map((group) => (
        <section key={group.date} className="time-group">
          <h3>{formatFullDate(group.date)}</h3>
          {group.items.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </section>
      ))}
    </div>
  )
}

function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="2.2" y="3" width="11.6" height="10.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 6.4h11.6M5.2 1.8v2.4M10.8 1.8v2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
