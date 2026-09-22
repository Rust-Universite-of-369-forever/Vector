import './analytics.js'
import './style.css'
import { auth } from './firebase.js'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile
} from 'firebase/auth'

function storageKey(base, uid) {
  return uid ? `vector_${base}_${uid}` : `vector_${base}`
}

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch { return fallback }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

let currentUser = null
let currentPage = 'home'

const today = () => new Date().toISOString().slice(0, 10)
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) days.push(daysAgo(i))
  return days
}
function uid() { return currentUser?.uid || null }

/* ========== Event log + CSV ========== */
function getEvents() {
  return Storage.get(storageKey('events', uid()), [])
}

function logEvent(action, detail = '') {
  const events = getEvents()
  events.push({
    timestamp: new Date().toISOString(),
    userId: uid() || 'anonymous',
    action,
    detail: String(detail || '').slice(0, 200)
  })
  Storage.set(storageKey('events', uid()), events.slice(-2000))
}

function downloadCSV(filename, header, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [header.join(','), ...rows.map(r => r.map(escape).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportEventsCSV() {
  const events = getEvents()
  if (!events.length) { showToast('No events yet'); return }
  downloadCSV(
    `vector-events-${today()}.csv`,
    ['timestamp', 'userId', 'action', 'detail'],
    events.map(e => [e.timestamp, e.userId, e.action, e.detail])
  )
  logEvent('export_csv', 'events')
  showToast(`Exported ${events.length} events`)
}

function exportHabitsCSV() {
  const habits = getHabits()
  const rows = []
  habits.forEach(h => {
    (h.history || []).forEach(d => rows.push([h.title, d]))
  })
  if (!rows.length) { showToast('No habit data'); return }
  downloadCSV(`vector-habits-${today()}.csv`, ['habit', 'date'], rows)
  logEvent('export_csv', 'habits')
  showToast(`Exported ${rows.length} check-ins`)
}

function exportGoalsCSV() {
  const goals = getGoals()
  if (!goals.length) { showToast('No goals'); return }
  downloadCSV(
    `vector-goals-${today()}.csv`,
    ['title', 'completed', 'createdAt', 'completedAt'],
    goals.map(g => [g.title, g.completed ? 'yes' : 'no', g.createdAt || '', g.completedAt || ''])
  )
  logEvent('export_csv', 'goals')
  showToast(`Exported ${goals.length} goals`)
}

function exportJournalCSV() {
  const journal = getJournal()
  if (!journal.length) { showToast('No journal entries'); return }
  downloadCSV(
    `vector-journal-${today()}.csv`,
    ['date', 'text'],
    journal.map(e => [e.date, e.text])
  )
  logEvent('export_csv', 'journal')
  showToast(`Exported ${journal.length} entries`)
}

/* ========== Data ========== */
function getProfile() {
  return Storage.get(storageKey('profile', uid()), {
    name: currentUser?.displayName || 'Friend',
    level: 'Beginner',
    points: 0,
    createdAt: new Date().toISOString(),
    lastActiveDay: null
  })
}
function saveProfile(p) { Storage.set(storageKey('profile', uid()), p) }
function getHabits() { return Storage.get(storageKey('habits', uid()), []) }
function saveHabits(h) { Storage.set(storageKey('habits', uid()), h) }
function getGoals() { return Storage.get(storageKey('goals', uid()), []) }
function saveGoals(g) { Storage.set(storageKey('goals', uid()), g) }
function getJournal() { return Storage.get(storageKey('journal', uid()), []) }
function saveJournal(j) { Storage.set(storageKey('journal', uid()), j) }

function getActiveGoals() { return getGoals().filter(g => !g.completed && !g.deleted) }
function getDeletedGoals() { return getGoals().filter(g => g.deleted && !g.completed) }
function getCompletedGoals() { return getGoals().filter(g => g.completed) }

function getActiveDays() {
  const set = new Set()
  getHabits().forEach(h => (h.history || []).forEach(d => set.add(d)))
  getJournal().forEach(e => set.add(e.date.slice(0, 10)))
  getCompletedGoals().forEach(g => { if (g.completedAt) set.add(g.completedAt.slice(0, 10)) })
  return set
}

function getOverallStreak() {
  const allDays = getActiveDays()
  if (allDays.size === 0) return 0
  let streak = 0, expected = today()
  if (!allDays.has(expected)) {
    const y = daysAgo(1)
    if (!allDays.has(y)) return 0
    expected = y
  }
  while (allDays.has(expected)) {
    streak++
    const d = new Date(expected)
    d.setDate(d.getDate() - 1)
    expected = d.toISOString().slice(0, 10)
  }
  return streak
}

function getBestStreak() {
  const allDays = [...getActiveDays()].sort()
  if (!allDays.length) return 0
  let best = 1, cur = 1
  for (let i = 1; i < allDays.length; i++) {
    const diff = Math.round((new Date(allDays[i]) - new Date(allDays[i - 1])) / 86400000)
    if (diff === 1) { cur++; best = Math.max(best, cur) }
    else cur = 1
  }
  return best
}

function daysSinceLastActivity() {
  const allDays = [...getActiveDays()].sort().reverse()
  if (!allDays.length) return null
  return Math.round((new Date(today()) - new Date(allDays[0])) / 86400000)
}

function calcHabitStreak(habit) {
  if (!habit.history?.length) return 0
  const sorted = [...habit.history].sort().reverse()
  let streak = 0, expected = today()
  for (const day of sorted) {
    if (day === expected) {
      streak++
      const d = new Date(expected)
      d.setDate(d.getDate() - 1)
      expected = d.toISOString().slice(0, 10)
    } else if (day < expected) break
  }
  return streak
}

function awardDailyActivity(points = 10) {
  const profile = getProfile()
  const t = today()
  if (profile.lastActiveDay === t) profile.points = (profile.points || 0) + Math.floor(points / 2)
  else { profile.points = (profile.points || 0) + points; profile.lastActiveDay = t }
  profile.level = calcLevel(profile.points)
  saveProfile(profile)
  return profile.points
}

function calcLevel(points) {
  const p = points ?? getProfile().points ?? 0
  if (p >= 500) return 'Master'
  if (p >= 200) return 'Practitioner'
  if (p >= 50) return 'Explorer'
  return 'Beginner'
}

function dayWord(n) { return n === 1 ? 'day' : 'days' }

function get30DayStats() {
  const monthAgo = daysAgo(30), prevStart = daysAgo(60)
  const habits = getHabits(), journal = getJournal(), goals = getGoals()
  let checks30 = 0, checksPrev = 0
  habits.forEach(h => (h.history || []).forEach(d => {
    if (d >= monthAgo) checks30++
    else if (d >= prevStart) checksPrev++
  }))
  const journal30 = journal.filter(e => e.date.slice(0, 10) >= monthAgo).length
  const journalPrev = journal.filter(e => { const d = e.date.slice(0, 10); return d >= prevStart && d < monthAgo }).length
  const goals30 = goals.filter(g => g.completed && g.completedAt && g.completedAt.slice(0, 10) >= monthAgo).length
  const goalsPrev = goals.filter(g => {
    if (!g.completed || !g.completedAt) return false
    const d = g.completedAt.slice(0, 10)
    return d >= prevStart && d < monthAgo
  }).length
  const total30 = checks30 + journal30 + goals30
  const totalPrev = checksPrev + journalPrev + goalsPrev
  let activityPct = 0
  if (totalPrev === 0) activityPct = total30 > 0 ? 100 : 0
  else activityPct = Math.round(((total30 - totalPrev) / totalPrev) * 100)
  return { goals30, checks30, journal30, total30, activityPct }
}

function getWeekRange() {
  const now = new Date(), day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), isSunday: day === 0 }
}

function getWeekStats(start, end) {
  const habits = getHabits(), journal = getJournal(), goals = getGoals()
  let checks = 0
  const habitTitles = {}
  habits.forEach(h => {
    const inWeek = (h.history || []).filter(d => d >= start && d <= end)
    checks += inWeek.length
    if (inWeek.length) habitTitles[h.title] = inWeek.length
  })
  const journalCount = journal.filter(e => { const d = e.date.slice(0, 10); return d >= start && d <= end }).length
  const goalsCount = goals.filter(g => g.completed && g.completedAt && g.completedAt.slice(0, 10) >= start && g.completedAt.slice(0, 10) <= end).length
  const reading = Object.entries(habitTitles).filter(([t]) => /read|book/i.test(t)).reduce((s, [, n]) => s + n, 0)
  const sport = Object.entries(habitTitles).filter(([t]) => /sport|train|gym|run|yoga|workout/i.test(t)).reduce((s, [, n]) => s + n, 0)
  return { checks, journalCount, goalsCount, totalActions: checks + journalCount + goalsCount, reading, sport }
}

function getBestWeekInLastMonth() {
  let best = 0
  for (let w = 0; w < 4; w++) {
    const a = daysAgo(w * 7 + 6), b = daysAgo(w * 7)
    const s = a < b ? a : b, e = a < b ? b : a
    best = Math.max(best, getWeekStats(s, e).totalActions)
  }
  return best
}

function getDailyActionCounts() {
  return lastNDays(7).map(day => {
    let count = 0
    getHabits().forEach(h => { if (h.history?.includes(day)) count++ })
    getJournal().forEach(e => { if (e.date.slice(0, 10) === day) count++ })
    getCompletedGoals().forEach(g => { if (g.completedAt?.slice(0, 10) === day) count++ })
    return {
      day, count,
      label: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: day === today()
    }
  })
}

function getPathMonths() {
  const profile = getProfile()
  const startDate = profile.createdAt ? new Date(profile.createdAt) : new Date()
  const now = new Date()
  const months = []
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  while (cursor <= now) {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const activeDays = getActiveDays()
    const dayDots = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, '0')}`
      if (dateStr > today()) break
      if (dateStr < (profile.createdAt || '').slice(0, 10)) { dayDots.push({ active: false, future: true }); continue }
      dayDots.push({ active: activeDays.has(dateStr), future: false })
    }
    months.push({
      label: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      dots: dayDots,
      activeCount: dayDots.filter(d => d.active).length
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

function getAchievements() {
  const streak = getBestStreak()
  const totalChecks = getHabits().reduce((s, h) => s + (h.history?.length || 0), 0)
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

function daysWithVector() {
  const profile = getProfile()
  if (!profile.createdAt) return 1
  return Math.max(1, Math.floor((Date.now() - new Date(profile.createdAt)) / 86400000) + 1)
}

function totalActions() {
  return getHabits().reduce((s, h) => s + (h.history?.length || 0), 0) + getCompletedGoals().length + getJournal().length
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showToast(msg) {
  let t = document.querySelector('.toast')
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t) }
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._timer)
  t._timer = setTimeout(() => t.classList.remove('show'), 2400)
}

function ringSVG(percent, valueLabel) {
  const circ = 138.2
  const offset = circ - (Math.min(100, Math.max(0, percent)) / 100) * circ
  return `<div class="metric-ring"><svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="22"></circle><circle class="fill" cx="28" cy="28" r="22" style="stroke-dashoffset:${offset}"></circle></svg><div class="ring-value">${valueLabel}</div></div>`
}

/* ========== Auth ========== */
function renderAuth(mode = 'login') {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <div class="auth-logo">Vector</div>
      <p class="auth-subtitle">A calm path to a better version of you</p>
      <div class="auth-tabs">
        <button class="${mode === 'login' ? 'active' : ''}" data-mode="login">Log in</button>
        <button class="${mode === 'register' ? 'active' : ''}" data-mode="register">Sign up</button>
      </div>
      <div class="auth-error" id="auth-error"></div>
      <div class="auth-field"><label>Email</label><input type="email" id="auth-email" class="input" placeholder="you@example.com"></div>
      <div class="auth-field"><label>Password</label><input type="password" id="auth-password" class="input" placeholder="At least 6 characters"></div>
      ${mode === 'register' ? `<div class="auth-field"><label>Name</label><input type="text" id="auth-name" class="input" placeholder="What should we call you?"></div>` : ''}
      <button class="btn auth-submit" id="auth-submit">${mode === 'login' ? 'Log in' : 'Create account'}</button>
      <div class="auth-divider">or</div>
      <button class="btn btn-google" id="auth-google">Continue with Google</button>
    </div></div>`

  app.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => renderAuth(btn.dataset.mode)))
  const errorEl = document.getElementById('auth-error')
  const showError = (msg) => { errorEl.textContent = msg; errorEl.classList.add('show') }

  document.getElementById('auth-submit').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim()
    const password = document.getElementById('auth-password').value
    const submitBtn = document.getElementById('auth-submit')
    if (!email || !password) { showError('Please enter email and password'); return }
    if (password.length < 6) { showError('Password must be at least 6 characters'); return }
    submitBtn.disabled = true
    submitBtn.textContent = 'Please wait…'
    errorEl.classList.remove('show')
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password)
      else {
        const name = document.getElementById('auth-name')?.value.trim() || 'Friend'
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: name })
      }
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Wrong email or password',
        'auth/email-already-in-use': 'This email is already registered',
        'auth/configuration-not-found': 'Enable Email/Password in Firebase Console'
      }
      showError(map[err.code] || err.message || 'Something went wrong')
      submitBtn.disabled = false
      submitBtn.textContent = mode === 'login' ? 'Log in' : 'Create account'
    }
  })
  document.getElementById('auth-google').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') showError(err.message || 'Google sign-in failed') }
  })
  app.querySelectorAll('.input').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('auth-submit').click() })
  })
}

function renderApp() {
  const app = document.getElementById('app')
  const points = getProfile().points || 0
  app.innerHTML = `
    <header class="header">
      <div class="logo" data-page="home">Vector</div>
      <nav class="menu">
        <button data-page="home" class="${currentPage === 'home' ? 'active' : ''}">Home</button>
        <button data-page="goals" class="${currentPage === 'goals' ? 'active' : ''}">Goals</button>
        <button data-page="habits" class="${currentPage === 'habits' ? 'active' : ''}">Habits</button>
        <button data-page="journal" class="${currentPage === 'journal' ? 'active' : ''}">Journal</button>
        <button data-page="journey" class="${currentPage === 'journey' ? 'active' : ''}">Journey</button>
        <button data-page="progress" class="${currentPage === 'progress' ? 'active' : ''}">Progress</button>
        <button data-page="analytics" class="${currentPage === 'analytics' ? 'active' : ''}">Analytics</button>
        <button data-page="profile" class="profile ${currentPage === 'profile' ? 'active' : ''}">Profile</button>
      </nav>
      <button class="btn-logout" id="logout-btn">Log out</button>
    </header>
    <main class="container" id="page-content"></main>
    <p class="soft-footer">Vector · progress over pressure · ${points} ⭐</p>`

  app.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      currentPage = el.dataset.page
      logEvent('page_view', currentPage)
      renderApp()
    })
  })
  document.getElementById('logout-btn').addEventListener('click', () => {
    logEvent('logout')
    signOut(auth)
  })
  renderPage()
}

function renderPage() {
  const content = document.getElementById('page-content')
  switch (currentPage) {
    case 'home': content.innerHTML = pageHome(); bindHome(); animateRings(); break
    case 'goals': content.innerHTML = pageGoals(); bindGoals(); break
    case 'habits': content.innerHTML = pageHabits(); bindHabits(); break
    case 'journal': content.innerHTML = pageJournal(); bindJournal(); break
    case 'journey': content.innerHTML = pageJourney(); break
    case 'progress': content.innerHTML = pageProgress(); break
    case 'analytics': content.innerHTML = pageAnalytics(); break
    case 'profile': content.innerHTML = pageProfile(); bindProfile(); break
  }
}

function animateRings() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.metric-ring .fill').forEach(el => {
      const target = el.style.strokeDashoffset
      el.style.strokeDashoffset = '138.2'
      requestAnimationFrame(() => { el.style.strokeDashoffset = target })
    })
  })
}

function pageHome() {
  const profile = getProfile()
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
  const maxDaily = Math.max(1, ...daily.map(d => d.count))
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

  const barsHtml = daily.map(d => {
    const h = d.count === 0 ? 4 : Math.max(12, Math.round((d.count / maxDaily) * 80))
    return `<div class="week-bar-col"><div class="week-bar-count">${d.count || ''}</div><div class="week-bar ${d.isToday ? 'today' : ''}" style="height:${h}px"></div><div class="week-bar-label">${d.label}</div></div>`
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

function bindHome() {
  document.querySelectorAll('.gentle-card [data-page], .card [data-page]').forEach(el => {
    el.addEventListener('click', () => { currentPage = el.dataset.page; logEvent('page_view', currentPage); renderApp() })
  })
}

function pageGoals() {
  const active = getActiveGoals()
  const deleted = getDeletedGoals()
  const list = active.length === 0
    ? `<div class="empty-state"><div class="emoji">🌱</div><p>No goals yet. Add your first one.</p></div>`
    : `<div class="item-list">${active.map((g, i) => `
        <div class="item" style="animation-delay:${i * 0.04}s">
          <div class="checkbox" data-action="complete" data-id="${g.id}"></div>
          <div class="item-content"><div class="item-title">${escapeHtml(g.title)}</div><div class="item-meta">In progress · tap to complete</div></div>
          <div class="item-actions"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${g.id}">Delete</button></div>
        </div>`).join('')}</div>`
  return `
    <div class="page-header"><div><h1>🎯 Goals</h1><p class="subtitle">Complete once — leaves the list. Mistaken delete — restore below.</p></div></div>
    <div class="form-row"><input type="text" id="goal-input" class="input" placeholder="e.g. Read 10 minutes every day"><button class="btn" id="add-goal">Add</button></div>
    ${list}
    ${deleted.length ? `<div class="restore-bar"><button class="btn btn-restore" id="restore-last">↩ Restore last deleted</button></div><p style="font-size:13px;color:var(--text-muted);margin-top:8px">In trash: ${deleted.length}</p>` : ''}`
}

function bindGoals() {
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
    renderPage()
  })
  document.getElementById('goal-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-goal').click() })

  document.querySelectorAll('[data-action="complete"]').forEach(el => {
    el.addEventListener('click', () => {
      const g = getGoals().find(x => x.id === +el.dataset.id)
      if (!g || g.completed) return
      g.completed = true
      g.deleted = false
      g.completedAt = new Date().toISOString()
      if (!g.pointsAwarded) { g.pointsAwarded = true; const pts = awardDailyActivity(25); showToast(`Goal completed! · ${pts} ⭐`) }
      else showToast('Goal completed')
      saveGoals(getGoals().map(x => x.id === g.id ? g : x))
      logEvent('goal_complete', g.title)
      renderPage()
    })
  })
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      const goals = getGoals()
      const g = goals.find(x => x.id === +el.dataset.id)
      if (!g) return
      g.deleted = true
      g.deletedAt = new Date().toISOString()
      saveGoals(goals)
      logEvent('goal_delete', g.title)
      showToast('Deleted · restore below if needed')
      renderPage()
    })
  })
  document.getElementById('restore-last')?.addEventListener('click', () => {
    const goals = getGoals()
    const deleted = goals.filter(g => g.deleted && !g.completed).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    if (!deleted.length) return
    deleted[0].deleted = false
    deleted[0].deletedAt = null
    saveGoals(goals)
    logEvent('goal_restore', deleted[0].title)
    showToast('Goal restored ↩')
    renderPage()
  })
}

function pageHabits() {
  const habits = getHabits(), t = today(), streak = getOverallStreak(), bestStreak = getBestStreak(), since = daysSinceLastActivity()
  const week = lastNDays(7), activeDays = getActiveDays()
  const calendar = week.map(day => {
    const label = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    return `<div class="streak-day ${activeDays.has(day) ? 'done' : ''} ${day === t ? 'today' : ''}">${label}</div>`
  }).join('')
  let gentle = ''
  if (streak > 0) gentle = `<div class="gentle-card alive"><h3>🔥 ${streak} ${dayWord(streak)} in a row</h3><p>Check in today to keep the chain alive.</p></div>`
  else if (since !== null && since >= 2) gentle = `<div class="gentle-card paused"><h3>You missed a few days</h3><p>Your previous progress is safe — best streak was <strong>${bestStreak}</strong> ${dayWord(bestStreak)}.</p><button class="btn" id="focus-today">Come back today →</button></div>`

  const list = habits.length === 0
    ? `<div class="empty-state"><div class="emoji">🌿</div><p>Add a habit and check it off each day.</p></div>`
    : `<div class="item-list">${habits.map((h, i) => {
        const done = h.history?.includes(t), hs = calcHabitStreak(h)
        return `<div class="item ${done ? 'done' : ''}" style="animation-delay:${i * 0.04}s">
          <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle" data-id="${h.id}">${done ? '✓' : ''}</div>
          <div class="item-content"><div class="item-title">${escapeHtml(h.title)}</div><div class="item-meta">Streak: <strong>${hs}</strong> ${dayWord(hs)}${done ? ' · done today' : ''}</div></div>
          <div class="item-actions"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${h.id}">Delete</button></div>
        </div>`
      }).join('')}</div>`

  return `
    <div class="page-header"><div><h1>🔥 Habits</h1><p class="subtitle">Progress stays even if you skip a day</p></div></div>
    ${gentle}<div class="streak-calendar">${calendar}</div>
    <div class="form-row"><input type="text" id="habit-input" class="input" placeholder="e.g. Read for 10 minutes"><button class="btn" id="add-habit">Add</button></div>
    ${list}`
}

function bindHabits() {
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
    renderPage()
  })
  document.getElementById('habit-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-habit').click() })
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const habits = getHabits()
      const h = habits.find(x => x.id === +el.dataset.id)
      if (!h) return
      if (el.dataset.action === 'toggle') {
        if (!h.history) h.history = []
        const idx = h.history.indexOf(today())
        if (idx >= 0) {
          h.history.splice(idx, 1)
          saveHabits(habits)
          logEvent('habit_uncheck', h.title)
          showToast('Unchecked')
        } else {
          h.history.push(today())
          saveHabits(habits)
          const hs = calcHabitStreak(h)
          const pts = awardDailyActivity(15)
          logEvent('habit_check', h.title)
          showToast(hs > 1 ? `Streak: ${hs} 🔥 · ${pts} ⭐` : `Nice start · ${pts} ⭐`)
        }
        renderPage()
      } else if (el.dataset.action === 'delete') {
        saveHabits(habits.filter(x => x.id !== h.id))
        logEvent('habit_delete', h.title)
        showToast('Deleted')
        renderPage()
      }
    })
  })
}

function pageJournal() {
  const entries = getJournal().sort((a, b) => b.date.localeCompare(a.date))
  const list = entries.length === 0
    ? `<div class="empty-state"><div class="emoji">🕊️</div><p>Write your first entry — even a few lines.</p></div>`
    : entries.map((e, i) => {
        const d = new Date(e.date)
        const dateStr = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
        return `<div class="journal-entry" style="animation-delay:${i * 0.04}s">
          <div class="date">${dateStr} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="text">${escapeHtml(e.text)}</div>
          <div style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${e.id}">Delete</button></div>
        </div>`
      }).join('')
  return `
    <div class="page-header"><div><h1>📓 Journal</h1><p class="subtitle">Writing also keeps your progress alive</p></div></div>
    <div style="margin-bottom:24px">
      <textarea id="entry-input" class="input" placeholder="What mattered today?"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="btn" id="save-entry">Save</button><button class="btn btn-ghost" id="clear-entry">Clear</button></div>
    </div>${list}`
}

function bindJournal() {
  document.getElementById('save-entry')?.addEventListener('click', () => {
    const input = document.getElementById('entry-input')
    const text = input.value.trim()
    if (!text) return
    const entries = getJournal()
    entries.push({ id: Date.now(), text, date: new Date().toISOString() })
    saveJournal(entries)
    const pts = awardDailyActivity(10)
    logEvent('journal_save', text.slice(0, 40))
    input.value = ''
    showToast(`Saved · ${pts} ⭐`)
    renderPage()
  })
  document.getElementById('clear-entry')?.addEventListener('click', () => { document.getElementById('entry-input').value = '' })
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      saveJournal(getJournal().filter(e => e.id !== +el.dataset.id))
      logEvent('journal_delete')
      showToast('Deleted')
      renderPage()
    })
  })
}

function pageJourney() {
  const days = daysWithVector(), actions = totalActions()
  const checks = getHabits().reduce((s, h) => s + (h.history?.length || 0), 0)
  const goalsDone = getCompletedGoals().length, journalCount = getJournal().length
  const bestStreak = getBestStreak(), points = getProfile().points || 0
  const achievements = getAchievements(), months = getPathMonths()
  const pathHtml = months.map(m => `
    <div class="path-month"><div class="month-name">${m.label} · ${m.activeCount} active ${dayWord(m.activeCount)}</div>
    <div class="path-dots">${m.dots.map(d => d.future ? '' : `<div class="path-dot ${d.active ? (m.activeCount >= 15 ? 'strong' : 'active') : ''}"></div>`).join('')}</div></div>`).join('')
  const intro = months.length <= 1 ? 'Your path is just beginning. Each day you show up adds a dot.' : `${months.length} months ago you started. Every filled dot is a day you moved forward.`
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
    <div class="achievements">${achievements.map(a => `<div class="badge ${a.earned ? 'earned' : 'locked'}">${a.icon} ${a.title}</div>`).join('')}</div>`
}

function pageProgress() {
  const stats = get30DayStats()
  const monthAgo = daysAgo(30)
  let checksBefore = 0
  getHabits().forEach(h => (h.history || []).forEach(d => { if (d < monthAgo) checksBefore++ }))
  const journalBefore = getJournal().filter(e => e.date.slice(0, 10) < monthAgo).length
  const goalsBefore = getGoals().filter(g => g.completed && (!g.completedAt || g.completedAt.slice(0, 10) < monthAgo)).length
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

function pageAnalytics() {
  const habits = getHabits(), t = today()
  const totalChecks = habits.reduce((s, h) => s + (h.history?.length || 0), 0)
  const eventCount = getEvents().length
  const stats = [
    { value: habits.length, label: 'Habits' },
    { value: totalChecks, label: 'Total check-ins' },
    { value: habits.filter(h => h.history?.includes(t)).length, label: 'Done today' },
    { value: getOverallStreak(), label: 'Current streak' },
    { value: getBestStreak(), label: 'Best streak ever' },
    { value: getActiveGoals().length, label: 'Active goals' },
    { value: getCompletedGoals().length, label: 'Goals completed' },
    { value: getJournal().length, label: 'Journal entries' },
    { value: daysWithVector(), label: 'Days with Vector' },
    { value: getProfile().points || 0, label: 'Points ⭐' },
    { value: eventCount, label: 'Logged events' },
    { value: calcLevel(), label: 'Level' }
  ]
  return `
    <div class="page-header"><div><h1>📊 Analytics</h1><p class="subtitle">All numbers — no judgment</p></div></div>
    <div class="stats-grid">${stats.map(s => `<div class="stat-card"><div class="value">${s.value}</div><div class="label">${s.label}</div></div>`).join('')}</div>`
}

function pageProfile() {
  const profile = getProfile()
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

function bindProfile() {
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const profile = getProfile()
    profile.name = document.getElementById('name-input').value.trim() || 'Friend'
    saveProfile(profile)
    logEvent('profile_save')
    showToast('Saved 💛')
    renderPage()
  })
  document.getElementById('export-events')?.addEventListener('click', exportEventsCSV)
  document.getElementById('export-habits')?.addEventListener('click', exportHabitsCSV)
  document.getElementById('export-goals')?.addEventListener('click', exportGoalsCSV)
  document.getElementById('export-journal')?.addEventListener('click', exportJournalCSV)
}

document.getElementById('app').innerHTML = `<div class="loading-screen">Loading…</div>`

onAuthStateChanged(auth, (user) => {
  currentUser = user
  if (user) {
    const profile = getProfile()
    if ((!profile.name || profile.name === 'Friend') && user.displayName) profile.name = user.displayName
    if (!profile.createdAt) profile.createdAt = new Date().toISOString()
    if (profile.points == null) profile.points = 0
    saveProfile(profile)
    logEvent('login', user.email || user.uid)
    renderApp()
  } else {
    currentPage = 'home'
    renderAuth('login')
  }
})

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-page]')
  if (btn && btn.tagName === 'BUTTON' && btn.closest('.card')) {
    currentPage = btn.dataset.page
    logEvent('page_view', currentPage)
    renderApp()
  }
})

console.log('Vector 2.1 · events + CSV export')
