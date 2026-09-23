import { getProfile, saveProfile } from '../../core/repository.js'
import { getCurrentUser } from '../../core/state.js'
import { exportEventsCSV, exportGoalsCSV, exportHabitsCSV, exportJournalCSV } from '../../services/csv-export.js'
import { getEvents, logEvent } from '../../services/event-log.js'
import { calcLevel } from '../../services/progress.js'
import { escapeHtml, showToast } from '../../utils/dom.js'

export function renderProfilePage() {
  const profile = getProfile()
  const currentUser = getCurrentUser()
  const points = profile.points || 0
  const eventCount = getEvents().length
  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  return `
    <div class="page-header"><div><h1>👤 Profile</h1><p class="subtitle">A little about you</p></div></div>
    <div class="profile-card">
      <div class="profile-avatar">😊</div>
      <div class="profile-field"><label>Name</label><input type="text" id="name-input" class="input" value="${escapeHtml(profile.name || '')}"></div>
      <div class="profile-field"><label>Email</label><div style="color:var(--text-secondary);font-size:14px">${currentUser?.email || '—'}</div></div>
      <div class="profile-field"><label>Level</label><div style="font-size:18px;font-weight:700;color:var(--primary)">${calcLevel(points)}</div></div>
      <div class="profile-field"><label>Points</label><div style="font-size:18px;font-weight:700;color:var(--accent)">⭐ ${points}</div></div>
      <div class="profile-field"><label>With us since</label><div style="color:var(--text-secondary)">${joined}</div></div>
      <div class="profile-field"><label>Event log</label><div style="color:var(--text-secondary);font-size:14px">${eventCount} events recorded</div></div>
      <button class="btn" id="save-profile">Save</button>
      <div class="section-title" style="margin-top:28px">Export data (CSV)</div>
      <div class="export-row">
        <button class="btn btn-secondary" id="export-events" style="margin-top:0">Events</button>
        <button class="btn btn-secondary" id="export-habits" style="margin-top:0">Habits</button>
        <button class="btn btn-secondary" id="export-goals" style="margin-top:0">Goals</button>
        <button class="btn btn-secondary" id="export-journal" style="margin-top:0">Journal</button>
      </div>
      <p class="export-hint">Downloads a CSV file to your computer. Events include actions like habit checks, goal completes, and page views. Journal export contains your private text — keep it safe.</p>
    </div>`
}

export function bindProfilePage({ rerender }) {
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const profile = getProfile()
    profile.name = document.getElementById('name-input').value.trim() || 'Friend'
    saveProfile(profile)
    logEvent('profile_save')
    showToast('Saved 💛')
    rerender()
  })
  document.getElementById('export-events')?.addEventListener('click', exportEventsCSV)
  document.getElementById('export-habits')?.addEventListener('click', exportHabitsCSV)
  document.getElementById('export-goals')?.addEventListener('click', exportGoalsCSV)
  document.getElementById('export-journal')?.addEventListener('click', exportJournalCSV)
}
