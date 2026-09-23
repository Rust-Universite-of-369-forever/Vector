import { getActiveGoals, getDeletedGoals, getGoals, saveGoals } from '../../core/repository.js'
import { logEvent } from '../../services/event-log.js'
import { awardDailyActivity } from '../../services/progress.js'
import { escapeHtml, showToast } from '../../utils/dom.js'

export function renderGoalsPage() {
  const active = getActiveGoals()
  const deleted = getDeletedGoals()
  const list = active.length === 0
    ? `<div class="empty-state"><div class="emoji">🌱</div><p>No goals yet. Add your first one.</p></div>`
    : `<div class="item-list">${active.map((goal, index) => `
        <div class="item" style="animation-delay:${index * 0.04}s">
          <div class="checkbox" data-action="complete" data-id="${goal.id}"></div>
          <div class="item-content"><div class="item-title">${escapeHtml(goal.title)}</div><div class="item-meta">In progress · tap to complete</div></div>
          <div class="item-actions"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${goal.id}">Delete</button></div>
        </div>`).join('')}</div>`

  return `
    <div class="page-header"><div><h1>🎯 Goals</h1><p class="subtitle">Complete once — leaves the list. Mistaken delete — restore below.</p></div></div>
    <div class="form-row"><input type="text" id="goal-input" class="input" placeholder="e.g. Read 10 minutes every day"><button class="btn" id="add-goal">Add</button></div>
    ${list}
    ${deleted.length ? `<div class="restore-bar"><button class="btn btn-restore" id="restore-last">↩ Restore last deleted</button></div><p style="font-size:13px;color:var(--text-muted);margin-top:8px">In trash: ${deleted.length}</p>` : ''}`
}

export function bindGoalsPage({ rerender }) {
  document.getElementById('add-goal')?.addEventListener('click', () => {
    const input = document.getElementById('goal-input')
    const title = input.value.trim()
    if (!title) return
    const goals = getGoals()
    goals.unshift({ id: Date.now(), title, completed: false, deleted: false, pointsAwarded: false, createdAt: new Date().toISOString(), completedAt: null })
    saveGoals(goals)
    logEvent('goal_add', title)
    input.value = ''
    showToast('Goal added ✨')
    rerender()
  })

  document.getElementById('goal-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('add-goal').click()
  })

  document.querySelectorAll('[data-action="complete"]').forEach(element => {
    element.addEventListener('click', () => {
      const goal = getGoals().find(item => item.id === +element.dataset.id)
      if (!goal || goal.completed) return
      goal.completed = true
      goal.deleted = false
      goal.completedAt = new Date().toISOString()
      if (!goal.pointsAwarded) {
        goal.pointsAwarded = true
        const points = awardDailyActivity(25)
        showToast(`Goal completed! · ${points} ⭐`)
      } else {
        showToast('Goal completed')
      }
      saveGoals(getGoals().map(item => item.id === goal.id ? goal : item))
      logEvent('goal_complete', goal.title)
      rerender()
    })
  })

  document.querySelectorAll('[data-action="delete"]').forEach(element => {
    element.addEventListener('click', () => {
      const goals = getGoals()
      const goal = goals.find(item => item.id === +element.dataset.id)
      if (!goal) return
      goal.deleted = true
      goal.deletedAt = new Date().toISOString()
      saveGoals(goals)
      logEvent('goal_delete', goal.title)
      showToast('Deleted · restore below if needed')
      rerender()
    })
  })

  document.getElementById('restore-last')?.addEventListener('click', () => {
    const goals = getGoals()
    const deleted = goals
      .filter(goal => goal.deleted && !goal.completed)
      .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    if (!deleted.length) return
    deleted[0].deleted = false
    deleted[0].deletedAt = null
    saveGoals(goals)
    logEvent('goal_restore', deleted[0].title)
    showToast('Goal restored ↩')
    rerender()
  })
}
