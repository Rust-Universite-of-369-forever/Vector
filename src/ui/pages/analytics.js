import { getActiveGoals, getCompletedGoals, getHabits, getJournal, getProfile } from '../../core/repository.js'
import { getEvents } from '../../services/event-log.js'
import { calcLevel, daysWithVector, getBestStreak, getOverallStreak } from '../../services/progress.js'
import { today } from '../../utils/date.js'

export function renderAnalyticsPage() {
  const habits = getHabits()
  const currentDay = today()
  const totalChecks = habits.reduce((sum, habit) => sum + (habit.history?.length || 0), 0)
  const stats = [
    { value: habits.length, label: 'Habits' },
    { value: totalChecks, label: 'Total check-ins' },
    { value: habits.filter(habit => habit.history?.includes(currentDay)).length, label: 'Done today' },
    { value: getOverallStreak(), label: 'Current streak' },
    { value: getBestStreak(), label: 'Best streak ever' },
    { value: getActiveGoals().length, label: 'Active goals' },
    { value: getCompletedGoals().length, label: 'Goals completed' },
    { value: getJournal().length, label: 'Journal entries' },
    { value: daysWithVector(), label: 'Days with Vector' },
    { value: getProfile().points || 0, label: 'Points ⭐' },
    { value: getEvents().length, label: 'Logged events' },
    { value: calcLevel(), label: 'Level' }
  ]

  return `
    <div class="page-header"><div><h1>📊 Analytics</h1><p class="subtitle">All numbers — no judgment</p></div></div>
    <div class="stats-grid">${stats.map(stat => `<div class="stat-card"><div class="value">${stat.value}</div><div class="label">${stat.label}</div></div>`).join('')}</div>`
}
