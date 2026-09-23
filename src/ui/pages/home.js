import { getActiveGoals, getHabits, getJournal, getProfile } from '../../core/repository.js'
import { getCurrentUser } from '../../core/state.js'
import { daysSinceLastActivity, daysWithVector, get30DayStats, getBestStreak, getBestWeekInLastMonth, getDailyActionCounts, getOverallStreak, getWeekRange, getWeekStats, totalActions } from '../../services/progress.js'
import { dayWord } from '../../utils/date.js'
import { escapeHtml, ringSVG } from '../../utils/dom.js'

export function renderHomePage() {
  const profile = getProfile()
  const currentUser = getCurrentUser()
  const name = profile.name || currentUser?.displayName || 'friend'
  const stats = get30DayStats()
  const streak = getOverallStreak()
  const bestStreak = getBestStreak()
  const since = daysSinceLastActivity()
  const week = getWeekRange()
  const weekStats = getWeekStats(week.start, week.end)
  const bestWeek = getBestWeekInLastMonth()
  const isBestWeek = weekStats.totalActions > 0 && weekStats.totalActions >= bestWeek
  const daily = getDailyActionCounts()
  const maxDaily = Math.max(1, ...daily.map(day => day.count))
  const pctLabel = stats.activityPct > 0 ? `+${stats.activityPct}%` : stats.activityPct < 0 ? `${stats.activityPct}%` : stats.total30 > 0 ? '—' : '0%'

  let streakHtml = ''
  if (streak > 0) {
    streakHtml = `<div class="gentle-card alive"><h3>🔥 ${streak} ${dayWord(streak)} in a row</h3><p>You're on a roll. One small action today keeps it going.</p></div>`
  } else if (since !== null && since >= 2) {
    streakHtml = `<div class="gentle-card paused"><h3>You missed a few days</h3><p>That's okay. Your previous progress is safe — best streak was <strong>${bestStreak}</strong> ${dayWord(bestStreak)}. History stays.</p><button class="btn" data-page="habits">Come back today →</button></div>`
  } else if (since === 1) {
    streakHtml = `<div class="gentle-card paused"><h3>Yesterday is gone — today is open</h3><p>Your past check-ins are still here. One action today starts a new streak.</p><button class="btn" data-page="habits">Continue today →</button></div>`
  } else if (totalActions() === 0) {
    streakHtml = `<div class="gentle-card paused"><h3>Your path starts with one step</h3><p>Add a habit, finish a goal, or write a short journal entry.</p><button class="btn" data-page="habits">Begin →</button></div>`
  }

  const barsHtml = daily.map(day => {
    const height = day.count === 0 ? 4 : Math.max(12, Math.round((day.count / maxDaily) * 80))
    return `<div class="week-bar-col"><div class="week-bar-count">${day.count || ''}</div><div class="week-bar ${day.isToday ? 'today' : ''}" style="height:${height}px"></div><div class="week-bar-label">${day.label}</div></div>`
  }).join('')

  return `
    <section class="progress-hero">
      <h1>Hey, ${escapeHtml(name)} 👋</h1>
      <p class="hero-sub">Your progress · last 30 days</p>
      <div class="progress-metrics">
        <div class="metric">${ringSVG(Math.min(100, stats.goals30 * 15), stats.goals30)}<div class="metric-label">Goals</div></div>
        <div class="metric">${ringSVG(Math.min(100, stats.checks30 * 4), stats.checks30)}<div class="metric-label">Habits</div></div>
        <div class="metric">${ringSVG(Math.min(100, stats.journal30 * 6), stats.journal30)}<div class="metric-label">Journal</div></div>
        <div class="metric metric-big"><div class="metric-value">${pctLabel}</div><div class="metric-label">activity vs prior month</div></div>
      </div>
    </section>
    <div class="live-row">
      <div class="glass-card">
        <div class="card-title">This week</div>
        <div class="card-title-lg">${weekStats.totalActions} actions</div>
        <div class="week-bars">${barsHtml}</div>
      </div>
      <div class="glass-card streak-live">
        <div class="streak-circle ${streak > 0 ? 'alive' : ''}"><div class="fire">🔥</div><div class="num">${streak}</div><div class="unit">${dayWord(streak)}</div></div>
        <p class="streak-msg">${streak > 0 ? 'Keep the chain alive today' : bestStreak > 0 ? `Best ever: ${bestStreak} ${dayWord(bestStreak)}` : 'Start a streak today'}</p>
      </div>
    </div>
    ${streakHtml}
    <div class="week-card">
      ${week.isSunday ? `<div class="week-badge">Sunday · weekly review</div>` : `<div class="week-badge">This week</div>`}
      <h2>Your week in Vector</h2>
      <ul class="week-list">
        <li>✨ You completed <strong>${weekStats.totalActions}</strong> actions</li>
        ${weekStats.checks > 0 ? `<li>🔥 <strong>${weekStats.checks}</strong> habit check-ins</li>` : ''}
        ${weekStats.reading > 0 ? `<li>📖 Reading on <strong>${weekStats.reading}</strong> ${dayWord(weekStats.reading)}</li>` : ''}
        ${weekStats.sport > 0 ? `<li>💪 Trained <strong>${weekStats.sport}</strong> times</li>` : ''}
        ${weekStats.journalCount > 0 ? `<li>📓 Wrote <strong>${weekStats.journalCount}</strong> journal entries</li>` : ''}
        ${weekStats.goalsCount > 0 ? `<li>🎯 Finished <strong>${weekStats.goalsCount}</strong> goals</li>` : ''}
        ${weekStats.totalActions === 0 ? `<li><span>Quiet week so far — a soft start is fine.</span></li>` : ''}
      </ul>
      ${isBestWeek && weekStats.totalActions > 0 ? `<div class="week-best">This is your best week in the last month 🌟</div>` : ''}
    </div>
    <section class="dashboard">
      <div class="card"><div class="card-icon">🎯</div><h2>Goals</h2><p>${getActiveGoals().length === 0 ? 'No active goals' : `${getActiveGoals().length} active`}</p><button class="btn" data-page="goals">Open</button></div>
      <div class="card"><div class="card-icon">🔥</div><h2>Habits</h2><p>${getHabits().length === 0 ? 'Add your first habit' : `${getHabits().length} habits`}</p><button class="btn" data-page="habits">Open</button></div>
      <div class="card"><div class="card-icon">📓</div><h2>Journal</h2><p>${getJournal().length === 0 ? 'No entries yet' : `${getJournal().length} entries`}</p><button class="btn" data-page="journal">Write</button></div>
      <div class="card"><div class="card-icon">🛤️</div><h2>My path</h2><p>${daysWithVector()} ${dayWord(daysWithVector())} with Vector</p><button class="btn" data-page="journey">View path</button></div>
    </section>`
}
