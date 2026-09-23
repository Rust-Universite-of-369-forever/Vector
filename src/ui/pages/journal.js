import { getJournal, saveJournal } from '../../core/repository.js'
import { logEvent } from '../../services/event-log.js'
import { awardDailyActivity } from '../../services/progress.js'
import { escapeHtml, showToast } from '../../utils/dom.js'

export function renderJournalPage() {
  const entries = getJournal().sort((a, b) => b.date.localeCompare(a.date))
  const list = entries.length === 0
    ? `<div class="empty-state"><div class="emoji">🕊️</div><p>Write your first entry — even a few lines.</p></div>`
    : entries.map((entry, index) => {
        const date = new Date(entry.date)
        const dateString = date.toDateString() === new Date().toDateString()
          ? 'Today'
          : date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
        return `<div class="journal-entry" style="animation-delay:${index * 0.04}s">
          <div class="date">${dateString} · ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="text">${escapeHtml(entry.text)}</div>
          <div style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${entry.id}">Delete</button></div>
        </div>`
      }).join('')

  return `
    <div class="page-header"><div><h1>📓 Journal</h1><p class="subtitle">Writing also keeps your progress alive</p></div></div>
    <div style="margin-bottom:24px">
      <textarea id="entry-input" class="input" placeholder="What mattered today?"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="btn" id="save-entry">Save</button><button class="btn btn-ghost" id="clear-entry">Clear</button></div>
    </div>${list}`
}

export function bindJournalPage({ rerender }) {
  document.getElementById('save-entry')?.addEventListener('click', () => {
    const input = document.getElementById('entry-input')
    const text = input.value.trim()
    if (!text) return
    const entries = getJournal()
    entries.push({ id: Date.now(), text, date: new Date().toISOString() })
    saveJournal(entries)
    const points = awardDailyActivity(10)
    logEvent('journal_save', text.slice(0, 40))
    input.value = ''
    showToast(`Saved · ${points} ⭐`)
    rerender()
  })

  document.getElementById('clear-entry')?.addEventListener('click', () => {
    document.getElementById('entry-input').value = ''
  })

  document.querySelectorAll('[data-action="delete"]').forEach(element => {
    element.addEventListener('click', () => {
      saveJournal(getJournal().filter(entry => entry.id !== +element.dataset.id))
      logEvent('journal_delete')
      showToast('Deleted')
      rerender()
    })
  })
}
