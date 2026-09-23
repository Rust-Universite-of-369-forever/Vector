import { storage, storageKey } from '../core/storage.js'
import { getUserId } from '../core/state.js'

export function getEvents() {
  return storage.get(storageKey('events'), [])
}

export function logEvent(action, detail = '') {
  const events = getEvents()
  events.push({
    timestamp: new Date().toISOString(),
    userId: getUserId() || 'anonymous',
    action,
    detail: String(detail || '').slice(0, 200)
  })
  storage.set(storageKey('events'), events.slice(-2000))
}
