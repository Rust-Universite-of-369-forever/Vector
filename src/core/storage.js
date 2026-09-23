import { getUserId } from './state.js'

export function storageKey(base, userId = getUserId()) {
  return userId ? `vector_${base}_${userId}` : `vector_${base}`
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}
