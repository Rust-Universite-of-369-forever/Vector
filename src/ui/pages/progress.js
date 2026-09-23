import { getGoals, getHabits, getJournal } from '../../core/repository.js'
import { get30DayStats } from '../../services/progress.js'
import { daysAgo } from '../../utils/date.js'

export function renderProgressPage() {
  const stats = get30DayStats()
  const monthAgo = daysAgo(30)
  let checksBefore = 0
  getHabits().forEach(habit => (habit.history || []).forEach(day => { if (day < monthAgo) checksBefore++ }))
  const journalBefore = getJournal().filter(entry => entry.date.slice(0, 10) < monthAgo).length
  const goalsBefore = getGoals().filter(goal => goal.completed && (!goal.completedAt || goal.completedAt.slice(0, 10) < monthAgo)).length
  const hasData = stats.total30 + checksBefore + journalBefore + goalsBefore > 0

  return `
    <div class="page-header"><div><h1>📈 Progress</h1><p class="subtitle">Last 30 days vs earlier</p></div></div>
    ${!hasData ? `<div class="empty-state"><div class="emoji">🌱</div><p>Not enough data yet.</p></div>` : `
      <div class="compare-grid">
        <div class="compare-card before"><h3>🌑 Earlier</h3>
          <div class="compare-row"><span>Habit check-ins</span><span class="val">${checksBefore}</span></div>
          <div class="compare-row"><span>Journal</span><span class="val">${journalBefore}</span></div>
          <div class="compare-row"><span>Goals</span><span class="val">${goalsBefore}</span></div></div>
        <div class="compare-card after"><h3>✨ Last 30 days</h3>
          <div class="compare-row"><span>Habit check-ins</span><span class="val">${stats.checks30}</span></div>
          <div class="compare-row"><span>Journal</span><span class="val">${stats.journal30}</span></div>
          <div class="compare-row"><span>Goals</span><span class="val">${stats.goals30}</span></div></div>
      </div>
      <div class="delta-card"><h3>Your progress this month</h3>
        <div class="delta-item"><span class="plus">+${stats.checks30}</span> check-ins</div>
        <div class="delta-item"><span class="plus">+${stats.journal30}</span> journal entries</div>
        <div class="delta-item"><span class="plus">+${stats.goals30}</span> goals completed</div>
        <div class="delta-item"><span class="plus">${stats.activityPct > 0 ? '+' : ''}${stats.activityPct}%</span> activity change</div>
      </div>`}`
}
