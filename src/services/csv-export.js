import { getGoals, getHabits, getJournal } from '../core/repository.js'
import { today } from '../utils/date.js'
import { showToast } from '../utils/dom.js'
import { getEvents, logEvent } from './event-log.js'

function downloadCSV(filename, header, rows) {
  const escape = value => {
    const string = String(value ?? '')
    if (/[",\n]/.test(string)) return `"${string.replace(/"/g, '""')}"`
    return string
  }

  const lines = [header.join(','), ...rows.map(row => row.map(escape).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportEventsCSV() {
  const events = getEvents()
  if (!events.length) {
    showToast('No events yet')
    return
  }
  downloadCSV(
    `vector-events-${today()}.csv`,
    ['timestamp', 'userId', 'action', 'detail'],
    events.map(event => [event.timestamp, event.userId, event.action, event.detail])
  )
  logEvent('export_csv', 'events')
  showToast(`Exported ${events.length} events`)
}

export function exportHabitsCSV() {
  const rows = []
  getHabits().forEach(habit => {
    ;(habit.history || []).forEach(day => rows.push([habit.title, day]))
  })
  if (!rows.length) {
    showToast('No habit data')
    return
  }
  downloadCSV(`vector-habits-${today()}.csv`, ['habit', 'date'], rows)
  logEvent('export_csv', 'habits')
  showToast(`Exported ${rows.length} check-ins`)
}

export function exportGoalsCSV() {
  const goals = getGoals()
  if (!goals.length) {
    showToast('No goals')
    return
  }
  downloadCSV(
    `vector-goals-${today()}.csv`,
    ['title', 'completed', 'createdAt', 'completedAt'],
    goals.map(goal => [goal.title, goal.completed ? 'yes' : 'no', goal.createdAt || '', goal.completedAt || ''])
  )
  logEvent('export_csv', 'goals')
  showToast(`Exported ${goals.length} goals`)
}

export function exportJournalCSV() {
  const journal = getJournal()
  if (!journal.length) {
    showToast('No journal entries')
    return
  }
  downloadCSV(
    `vector-journal-${today()}.csv`,
    ['date', 'text'],
    journal.map(entry => [entry.date, entry.text])
  )
  logEvent('export_csv', 'journal')
  showToast(`Exported ${journal.length} entries`)
}
