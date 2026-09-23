import { storage, storageKey } from './storage.js'
import { getCurrentUser } from './state.js'

export function getProfile() {
  const user = getCurrentUser()
  return storage.get(storageKey('profile'), {
    name: user?.displayName || 'Friend',
    level: 'Beginner',
    points: 0,
    createdAt: new Date().toISOString(),
    lastActiveDay: null
  })
}

export function saveProfile(profile) {
  storage.set(storageKey('profile'), profile)
}

export function getHabits() {
  return storage.get(storageKey('habits'), [])
}

export function saveHabits(habits) {
  storage.set(storageKey('habits'), habits)
}

export function getGoals() {
  return storage.get(storageKey('goals'), [])
}

export function saveGoals(goals) {
  storage.set(storageKey('goals'), goals)
}

export function getJournal() {
  return storage.get(storageKey('journal'), [])
}

export function saveJournal(journal) {
  storage.set(storageKey('journal'), journal)
}

export function getActiveGoals() {
  return getGoals().filter(goal => !goal.completed && !goal.deleted)
}

export function getDeletedGoals() {
  return getGoals().filter(goal => goal.deleted && !goal.completed)
}

export function getCompletedGoals() {
  return getGoals().filter(goal => goal.completed)
}
