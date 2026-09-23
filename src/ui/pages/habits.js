import { getHabits, saveHabits } from '../../core/repository.js'
import { logEvent } from '../../services/event-log.js'
import { awardDailyActivity, calcHabitStreak, daysSinceLastActivity, getActiveDays, getBestStreak, getOverallStreak } from '../../services/progress.js'
import { dayWord, lastNDays, today } from '../../utils/date.js'
import { escapeHtml, showToast } from '../../utils/dom.js'

export function renderHabitsPage() {
  const habits = getHabits()
  const currentDay = today()
  const streak = getOverallStreak()
  const bestStreak = getBestStreak()
  const since = daysSinceLastActivity()
  const week = lastNDays(7)
  const activeDays = getActiveDays()
  const calendar = week.map(day => {
    const label = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
    return `<div class="streak-day ${activeDays.has(day) ? 'done' : ''} ${day === currentDay ? 'today' : ''}">${label}</div>`
  }).join('')

  let gentle = ''
  if (streak > 0) gentle = `<div class="gentle-card alive"><h3>🔥 ${streak} ${dayWord(streak)} in a row</h3><p>Check in today to keep the chain alive.</p></div>`
  else if (since !== null && since >= 2) gentle = `<div class="gentle-card paused"><h3>You missed a few days</h3><p>Your previous progress is safe — best streak was <strong>${bestStreak}</strong> ${dayWord(bestStreak)}.</p><button class="btn" id="focus-today">Come back today →</button></div>`

  const list = habits.length === 0
    ? `<div class="empty-state"><div class="emoji">🌿</div><p>Add a habit and check it off each day.</p></div>`
    : `<div class="item-list">${habits.map((habit, index) => {
        const done = habit.history?.includes(currentDay)
        const habitStreak = calcHabitStreak(habit)
        return `<div class="item ${done ? 'done' : ''}" style="animation-delay:${index * 0.04}s">
          <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle" data-id="${habit.id}">${done ? '✓' : ''}</div>
          <div class="item-content"><div class="item-title">${escapeHtml(habit.title)}</div><div class="item-meta">Streak: <strong>${habitStreak}</strong> ${dayWord(habitStreak)}${done ? ' · done today' : ''}</div></div>
          <div class="item-actions"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${habit.id}">Delete</button></div>
        </div>`
      }).join('')}</div>`

  return `
    <div class="page-header"><div><h1>🔥 Habits</h1><p class="subtitle">Progress stays even if you skip a day</p></div></div>
    ${gentle}<div class="streak-calendar">${calendar}</div>
    <div class="form-row"><input type="text" id="habit-input" class="input" placeholder="e.g. Read for 10 minutes"><button class="btn" id="add-habit">Add</button></div>
    ${list}`
}

export function bindHabitsPage({ rerender }) {
  document.getElementById('focus-today')?.addEventListener('click', () => document.getElementById('habit-input')?.focus())
  document.getElementById('add-habit')?.addEventListener('click', () => {
    const input = document.getElementById('habit-input')
    const title = input.value.trim()
    if (!title) return
    const habits = getHabits()
    habits.unshift({ id: Date.now(), title, history: [], createdAt: new Date().toISOString() })
    saveHabits(habits)
    logEvent('habit_add', title)
    input.value = ''
    showToast('Habit added 🌱')
    rerender()
  })

  document.getElementById('habit-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('add-habit').click()
  })

  document.querySelectorAll('[data-action]').forEach(element => {
    element.addEventListener('click', () => {
      const habits = getHabits()
      const habit = habits.find(item => item.id === +element.dataset.id)
      if (!habit) return

      if (element.dataset.action === 'toggle') {
        if (!habit.history) habit.history = []
        const index = habit.history.indexOf(today())
        if (index >= 0) {
          habit.history.splice(index, 1)
          saveHabits(habits)
          logEvent('habit_uncheck', habit.title)
          showToast('Unchecked')
        } else {
          habit.history.push(today())
          saveHabits(habits)
          const habitStreak = calcHabitStreak(habit)
          const points = awardDailyActivity(15)
          logEvent('habit_check', habit.title)
          showToast(habitStreak > 1 ? `Streak: ${habitStreak} 🔥 · ${points} ⭐` : `Nice start · ${points} ⭐`)
        }
        rerender()
      } else if (element.dataset.action === 'delete') {
        saveHabits(habits.filter(item => item.id !== habit.id))
        logEvent('habit_delete', habit.title)
        showToast('Deleted')
        rerender()
      }
    })
  })
}
