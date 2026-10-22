// Все «дни» в Vector — это локальные даты пользователя в формате YYYY-MM-DD.
// Раньше использовался toISOString().slice(0, 10), то есть дата по UTC:
// в Уфе (UTC+5) с 00:00 до 05:00 «сегодня» было вчерашним днём.
// Метки времени (createdAt, completedAt, date у дневника) по-прежнему
// хранятся как ISO-строки; в «день» их переводит dayKeyFromISO().

const pad = n => String(n).padStart(2, '0')

export function toDayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dayKeyFromISO(iso) {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : toDayKey(date)
}

export function addDays(dayKey, n) {
  const date = new Date(`${dayKey}T12:00:00`)
  date.setDate(date.getDate() + n)
  return toDayKey(date)
}

export const today = () => toDayKey()

export function daysAgo(n) {
  return addDays(today(), -n)
}

export function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) days.push(daysAgo(i))
  return days
}

export function dayWord(n) {
  return n === 1 ? 'day' : 'days'
}
