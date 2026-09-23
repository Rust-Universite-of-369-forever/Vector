export const today = () => new Date().toISOString().slice(0, 10)

export function daysAgo(n) {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString().slice(0, 10)
}

export function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) days.push(daysAgo(i))
  return days
}

export function dayWord(n) {
  return n === 1 ? 'day' : 'days'
}
