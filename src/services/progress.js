import { getActiveGoals, getCompletedGoals, getGoals, getHabits, getJournal, getProfile, saveProfile } from '../core/repository.js'
import { daysAgo, lastNDays, today } from '../utils/date.js'

export function getActiveDays() {
  const activeDays = new Set()
  getHabits().forEach(habit => (habit.history || []).forEach(day => activeDays.add(day)))
  getJournal().forEach(entry => activeDays.add(entry.date.slice(0, 10)))
  getCompletedGoals().forEach(goal => {
    if (goal.completedAt) activeDays.add(goal.completedAt.slice(0, 10))
  })
  return activeDays
}

export function getOverallStreak() {
  const allDays = getActiveDays()
  if (allDays.size === 0) return 0

  let streak = 0
  let expected = today()
  if (!allDays.has(expected)) {
    const yesterday = daysAgo(1)
    if (!allDays.has(yesterday)) return 0
    expected = yesterday
  }

  while (allDays.has(expected)) {
    streak++
    const date = new Date(expected)
    date.setDate(date.getDate() - 1)
    expected = date.toISOString().slice(0, 10)
  }
  return streak
}

export function getBestStreak() {
  const allDays = [...getActiveDays()].sort()
  if (!allDays.length) return 0

  let best = 1
  let current = 1
  for (let i = 1; i < allDays.length; i++) {
    const diff = Math.round((new Date(allDays[i]) - new Date(allDays[i - 1])) / 86400000)
    if (diff === 1) {
      current++
      best = Math.max(best, current)
    } else {
      current = 1
    }
  }
  return best
}

export function daysSinceLastActivity() {
  const allDays = [...getActiveDays()].sort().reverse()
  if (!allDays.length) return null
  return Math.round((new Date(today()) - new Date(allDays[0])) / 86400000)
}

export function calcHabitStreak(habit) {
  if (!habit.history?.length) return 0
  const sorted = [...habit.history].sort().reverse()
  let streak = 0
  let expected = today()

  for (const day of sorted) {
    if (day === expected) {
      streak++
      const date = new Date(expected)
      date.setDate(date.getDate() - 1)
      expected = date.toISOString().slice(0, 10)
    } else if (day < expected) {
      break
    }
  }
  return streak
}

export function awardDailyActivity(points = 10) {
  const profile = getProfile()
  const currentDay = today()
  if (profile.lastActiveDay === currentDay) {
    profile.points = (profile.points || 0) + Math.floor(points / 2)
  } else {
    profile.points = (profile.points || 0) + points
    profile.lastActiveDay = currentDay
  }
  profile.level = calcLevel(profile.points)
  saveProfile(profile)
  return profile.points
}

export function calcLevel(points) {
  const value = points ?? getProfile().points ?? 0
  if (value >= 500) return 'Master'
  if (value >= 200) return 'Practitioner'
  if (value >= 50) return 'Explorer'
  return 'Beginner'
}

export function get30DayStats() {
  const monthAgo = daysAgo(30)
  const previousStart = daysAgo(60)
  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()
  let checks30 = 0
  let checksPrev = 0

  habits.forEach(habit => (habit.history || []).forEach(day => {
    if (day >= monthAgo) checks30++
    else if (day >= previousStart) checksPrev++
  }))

  const journal30 = journal.filter(entry => entry.date.slice(0, 10) >= monthAgo).length
  const journalPrev = journal.filter(entry => {
    const day = entry.date.slice(0, 10)
    return day >= previousStart && day < monthAgo
  }).length
  const goals30 = goals.filter(goal => goal.completed && goal.completedAt && goal.completedAt.slice(0, 10) >= monthAgo).length
  const goalsPrev = goals.filter(goal => {
    if (!goal.completed || !goal.completedAt) return false
    const day = goal.completedAt.slice(0, 10)
    return day >= previousStart && day < monthAgo
  }).length

  const total30 = checks30 + journal30 + goals30
  const totalPrev = checksPrev + journalPrev + goalsPrev
  const activityPct = totalPrev === 0
    ? (total30 > 0 ? 100 : 0)
    : Math.round(((total30 - totalPrev) / totalPrev) * 100)

  return { goals30, checks30, journal30, total30, activityPct }
}

export function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    isSunday: day === 0
  }
}

export function getWeekStats(start, end) {
  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()
  let checks = 0
  const habitTitles = {}

  habits.forEach(habit => {
    const inWeek = (habit.history || []).filter(day => day >= start && day <= end)
    checks += inWeek.length
    if (inWeek.length) habitTitles[habit.title] = inWeek.length
  })

  const journalCount = journal.filter(entry => {
    const day = entry.date.slice(0, 10)
    return day >= start && day <= end
  }).length
  const goalsCount = goals.filter(goal => goal.completed && goal.completedAt && goal.completedAt.slice(0, 10) >= start && goal.completedAt.slice(0, 10) <= end).length
  const reading = Object.entries(habitTitles).filter(([title]) => /read|book/i.test(title)).reduce((sum, [, count]) => sum + count, 0)
  const sport = Object.entries(habitTitles).filter(([title]) => /sport|train|gym|run|yoga|workout/i.test(title)).reduce((sum, [, count]) => sum + count, 0)
  return { checks, journalCount, goalsCount, totalActions: checks + journalCount + goalsCount, reading, sport }
}

export function getBestWeekInLastMonth() {
  let best = 0
  for (let week = 0; week < 4; week++) {
    const first = daysAgo(week * 7 + 6)
    const second = daysAgo(week * 7)
    const start = first < second ? first : second
    const end = first < second ? second : first
    best = Math.max(best, getWeekStats(start, end).totalActions)
  }
  return best
}

export function getDailyActionCounts() {
  return lastNDays(7).map(day => {
    let count = 0
    getHabits().forEach(habit => { if (habit.history?.includes(day)) count++ })
    getJournal().forEach(entry => { if (entry.date.slice(0, 10) === day) count++ })
    getCompletedGoals().forEach(goal => { if (goal.completedAt?.slice(0, 10) === day) count++ })
    return {
      day,
      count,
      label: new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: day === today()
    }
  })
}

export function getPathMonths() {
  const profile = getProfile()
  const startDate = profile.createdAt ? new Date(profile.createdAt) : new Date()
  const now = new Date()
  const months = []
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const activeDays = getActiveDays()

  while (cursor <= now) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dayDots = []

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${key}-${String(day).padStart(2, '0')}`
      if (dateStr > today()) break
      if (dateStr < (profile.createdAt || '').slice(0, 10)) {
        dayDots.push({ active: false, future: true })
        continue
      }
      dayDots.push({ active: activeDays.has(dateStr), future: false })
    }

    months.push({
      label: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      dots: dayDots,
      activeCount: dayDots.filter(day => day.active).length
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export function getAchievements() {
  const streak = getBestStreak()
  const totalChecks = getHabits().reduce((sum, habit) => sum + (habit.history?.length || 0), 0)
  const goalsDone = getCompletedGoals().length
  const journal = getJournal().length
  const points = getProfile().points || 0
  return [
    { icon: '🌱', title: 'First step', earned: totalChecks + journal + goalsDone > 0 },
    { icon: '🔥', title: '3-day streak', earned: streak >= 3 },
    { icon: '🔥', title: 'Week streak', earned: streak >= 7 },
    { icon: '💎', title: 'Month streak', earned: streak >= 30 },
    { icon: '✅', title: '10 check-ins', earned: totalChecks >= 10 },
    { icon: '🏆', title: '50 check-ins', earned: totalChecks >= 50 },
    { icon: '🎯', title: 'First goal', earned: goalsDone >= 1 },
    { icon: '🌟', title: '5 goals', earned: goalsDone >= 5 },
    { icon: '📓', title: '7 journal entries', earned: journal >= 7 },
    { icon: '⭐', title: '100 points', earned: points >= 100 }
  ]
}

export function daysWithVector() {
  const profile = getProfile()
  if (!profile.createdAt) return 1
  return Math.max(1, Math.floor((Date.now() - new Date(profile.createdAt)) / 86400000) + 1)
}

export function totalActions() {
  return getHabits().reduce((sum, habit) => sum + (habit.history?.length || 0), 0) + getCompletedGoals().length + getJournal().length
}

export { getActiveGoals }
