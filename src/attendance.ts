import type { Activity } from './types'

export function isEventAttendance(activity: Pick<Activity, 'type' | 'eventId'>) {
  return activity.type === 'event' && Boolean(activity.eventId)
}
