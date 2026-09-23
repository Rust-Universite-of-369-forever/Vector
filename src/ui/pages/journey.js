import { getCompletedGoals, getHabits, getJournal, getProfile } from '../../core/repository.js'
import { daysWithVector, getAchievements, getBestStreak, getPathMonths, totalActions } from '../../services/progress.js'
import { dayWord } from '../../utils/date.js'

export function renderJourneyPage() {
  const days = daysWithVector()
  const actions = totalActions()
  const checks = getHabits().reduce((sum, habit) => sum + (habit.history?.length || 0), 0)
  const goalsDone = getCompletedGoals().length
  const journalCount = getJournal().length
  const bestStreak = getBestStreak()
  const points = getProfile().points || 0
  const achievements = getAchievements()
  const months = getPathMonths()
  const pathHtml = months.map(month => `
    <div class="path-month"><div class="month-name">${month.label} · ${month.activeCount} active ${dayWord(month.activeCount)}</div>
    <div class="path-dots">${month.dots.map(day => day.future ? '' : `<div class="path-dot ${day.active ? (month.activeCount >= 15 ? 'strong' : 'active') : ''}"></div>`).join('')}</div></div>`).join('')
  const intro = months.length <= 1
    ? 'Your path is just beginning. Each day you show up adds a dot.'
    : `${months.length} months ago you started. Every filled dot is a day you moved forward.`

  return `
    <div class="page-header"><div><h1>🛤️ My path</h1><p class="subtitle">The story of your growth — nothing is erased</p></div></div>
    <div class="journey-hero"><h2>With Vector for</h2><div class="big-number">${days}</div><div class="big-label">${dayWord(days)}</div></div>
    <div class="stats-grid" style="margin-bottom:28px">
      <div class="stat-card"><div class="value">${actions}</div><div class="label">total actions</div></div>
      <div class="stat-card"><div class="value">${checks}</div><div class="label">habit check-ins</div></div>
      <div class="stat-card"><div class="value">${goalsDone}</div><div class="label">goals done</div></div>
      <div class="stat-card"><div class="value">${journalCount}</div><div class="label">journal entries</div></div>
      <div class="stat-card"><div class="value">${bestStreak}</div><div class="label">best streak</div></div>
      <div class="stat-card"><div class="value">${points}</div><div class="label">points ⭐</div></div>
    </div>
    <div class="section-title">My path</div><p class="path-intro">${intro}</p>
    <div class="path-section">${pathHtml || '<p style="color:var(--text-muted)">No history yet.</p>'}
      <div class="path-legend"><span><i class="lg-active"></i> Active day</span><span><i class="lg-strong"></i> Strong month</span><span><i class="lg-empty"></i> Quiet day</span></div>
    </div>
    <div class="section-title">Achievements</div>
    <div class="achievements">${achievements.map(achievement => `<div class="badge ${achievement.earned ? 'earned' : 'locked'}">${achievement.icon} ${achievement.title}</div>`).join('')}</div>`
}
