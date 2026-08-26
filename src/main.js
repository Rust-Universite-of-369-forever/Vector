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

function getActiveGoals() {
  return getGoals().filter(g => !g.completed && !g.deleted)
}
function getDeletedGoals() {
  return getGoals().filter(g => g.deleted && !g.completed)
}
function getCompletedGoals() {
  return getGoals().filter(g => g.completed)
}

function getActiveDays() {
  const set = new Set()
  getHabits().forEach(h => (h.history || []).forEach(d => set.add(d)))
  getJournal().forEach(e => set.add(e.date.slice(0, 10)))
  getCompletedGoals().forEach(g => {
    if (g.completedAt) set.add(g.completedAt.slice(0, 10))
  })
  return set
}

/** Current consecutive streak (may be 0 if skipped) */
function getOverallStreak() {
  const allDays = getActiveDays()
  if (allDays.size === 0) return 0
  let streak = 0
  let expected = today()
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

/** Longest consecutive streak ever (history is never erased) */
function getBestStreak() {
  const allDays = [...getActiveDays()].sort()
  if (allDays.length === 0) return 0
  let best = 1
  let cur = 1
  for (let i = 1; i < allDays.length; i++) {
    const prev = new Date(allDays[i - 1])
    const next = new Date(allDays[i])
    const diff = Math.round((next - prev) / 86400000)
    if (diff === 1) {
      cur++
      best = Math.max(best, cur)
    } else {
      cur = 1
    }
  }
  return best
}

/** Days since last activity */
function daysSinceLastActivity() {
  const allDays = [...getActiveDays()].sort().reverse()
  if (allDays.length === 0) return null
  const last = allDays[0]
  const diff = Math.round((new Date(today()) - new Date(last)) / 86400000)
  return diff
}

function calcHabitStreak(habit) {
  if (!habit.history?.length) return 0
  const sorted = [...habit.history].sort().reverse()
  let streak = 0
  let expected = today()
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
  if (profile.lastActiveDay === t) {
    profile.points = (profile.points || 0) + Math.floor(points / 2)
  } else {
    profile.points = (profile.points || 0) + points
    profile.lastActiveDay = t
  }
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

function dayWord(n) {
  return n === 1 ? 'day' : 'days'
}

/* ===== 30-day progress stats ===== */
function get30DayStats() {
  const monthAgo = daysAgo(30)
  const prevStart = daysAgo(60)

  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()

  let checks30 = 0
  let checksPrev = 0
  habits.forEach(h => {
    (h.history || []).forEach(d => {
      if (d >= monthAgo) checks30++
      else if (d >= prevStart) checksPrev++
    })
  })

  const journal30 = journal.filter(e => e.date.slice(0, 10) >= monthAgo).length
  const journalPrev = journal.filter(e => {
    const d = e.date.slice(0, 10)
    return d >= prevStart && d < monthAgo
  }).length

  const goals30 = goals.filter(g => g.completed && g.completedAt && g.completedAt.slice(0, 10) >= monthAgo).length
  const goalsPrev = goals.filter(g => {
    if (!g.completed || !g.completedAt) return false
    const d = g.completedAt.slice(0, 10)
    return d >= prevStart && d < monthAgo
  }).length

  const total30 = checks30 + journal30 + goals30
  const totalPrev = checksPrev + journalPrev + goalsPrev

  let activityPct = 0
  if (totalPrev === 0) {
    activityPct = total30 > 0 ? 100 : 0
  } else {
    activityPct = Math.round(((total30 - totalPrev) / totalPrev) * 100)
  }

  return {
    goals30,
    checks30,
    journal30,
    total30,
    activityPct
  }
}

/* ===== Weekly summary ===== */
function getWeekRange() {
  const now = new Date()
  const day = now.getDay() // 0 Sun
  const start = new Date(now)
  // Week starts Monday
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(now.getDate() + mondayOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    isSunday: day === 0
  }
}

function getWeekStats(start, end) {
  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()

  let checks = 0
  const habitTitles = {}
  habits.forEach(h => {
    const inWeek = (h.history || []).filter(d => d >= start && d <= end)
    checks += inWeek.length
    if (inWeek.length > 0) {
      habitTitles[h.title] = inWeek.length
    }
  })

  const journalCount = journal.filter(e => {
    const d = e.date.slice(0, 10)
    return d >= start && d <= end
  }).length

  const goalsCount = goals.filter(g =>
    g.completed && g.completedAt &&
    g.completedAt.slice(0, 10) >= start &&
    g.completedAt.slice(0, 10) <= end
  ).length

  const totalActions = checks + journalCount + goalsCount

  // Category heuristics
  const reading = Object.entries(habitTitles)
    .filter(([t]) => /read|book|книг|чита/i.test(t))
    .reduce((s, [, n]) => s + n, 0)
  const sport = Object.entries(habitTitles)
    .filter(([t]) => /sport|train|gym|run|yoga|workout|трен|спорт|бег|зал/i.test(t))
    .reduce((s, [, n]) => s + n, 0)

  return { checks, journalCount, goalsCount, totalActions, reading, sport, habitTitles }
}

function getBestWeekInLastMonth() {
  let best = 0
  for (let w = 0; w < 4; w++) {
    const end = daysAgo(w * 7)
    const start = daysAgo(w * 7 + 6)
    // swap if needed
    const s = start < end ? start : end
    const e = start < end ? end : start
    const stats = getWeekStats(s, e)
    best = Math.max(best, stats.totalActions)
  }
  return best
}

/* ===== Path (month timeline) ===== */
function getPathMonths() {
  const profile = getProfile()
  const startDate = profile.createdAt ? new Date(profile.createdAt) : new Date()
  const now = new Date()
  const months = []
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)

  while (cursor <= now) {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const activeDays = getActiveDays()
    const dayDots = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, '0')}`
      // only show days up to today
      if (dateStr > today()) break
      // only from createdAt
      if (dateStr < (profile.createdAt || '').slice(0, 10)) {
        dayDots.push({ active: false, future: true })
        continue
      }
      dayDots.push({ active: activeDays.has(dateStr), future: false })
    }
    const activeCount = dayDots.filter(d => d.active).length
    months.push({
      key,
      label: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      dots: dayDots,
      activeCount
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

function getAchievements() {
  const streak = getBestStreak()
  const habits = getHabits()
  const goalsDone = getCompletedGoals().length
  const journal = getJournal()
  const totalChecks = habits.reduce((s, h) => s + (h.history?.length || 0), 0)
  const points = getProfile().points || 0
  return [
    { icon: '🌱', title: 'First step', earned: totalChecks + journal.length + goalsDone > 0 },
    { icon: '🔥', title: '3-day streak', earned: streak >= 3 },
    { icon: '🔥', title: 'Week streak', earned: streak >= 7 },
    { icon: '💎', title: 'Month streak', earned: streak >= 30 },
    { icon: '✅', title: '10 check-ins', earned: totalChecks >= 10 },
    { icon: '🏆', title: '50 check-ins', earned: totalChecks >= 50 },
    { icon: '🎯', title: 'First goal', earned: goalsDone >= 1 },
    { icon: '🌟', title: '5 goals', earned: goalsDone >= 5 },
    { icon: '📓', title: '7 journal entries', earned: journal.length >= 7 },
    { icon: '⭐', title: '100 points', earned: points >= 100 }
  ]
}

function daysWithVector() {
  const profile = getProfile()
  if (!profile.createdAt) return 1
  const diff = Math.floor((Date.now() - new Date(profile.createdAt)) / 86400000)
  return Math.max(1, diff + 1)
}

function totalActions() {
  const checks = getHabits().reduce((s, h) => s + (h.history?.length || 0), 0)
  return checks + getCompletedGoals().length + getJournal().length
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showToast(msg) {
  let t = document.querySelector('.toast')
  if (!t) {
    t = document.createElement('div')
    t.className = 'toast'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._timer)
  t._timer = setTimeout(() => t.classList.remove('show'), 2400)
}

/* ========== Auth ========== */
function renderAuth(mode = 'login') {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Vector<span>.</span></div>
        <p class="auth-subtitle">A calm path to a better version of you</p>
        <div class="auth-tabs">
          <button class="${mode === 'login' ? 'active' : ''}" data-mode="login">Log in</button>
          <button class="${mode === 'register' ? 'active' : ''}" data-mode="register">Sign up</button>
        </div>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-field">
          <label>Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="auth-field">
          <label>Password</label>
          <input type="password" id="auth-password" class="input" placeholder="At least 6 characters">
        </div>
        ${mode === 'register' ? `
          <div class="auth-field">
            <label>Name</label>
            <input type="text" id="auth-name" class="input" placeholder="What should we call you?">
          </div>
        ` : ''}
        <button class="btn auth-submit" id="auth-submit">
          ${mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <div class="auth-divider">or</div>
        <button class="btn btn-google" id="auth-google">Continue with Google</button>
      </div>
    </div>
  `

  app.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => renderAuth(btn.dataset.mode))
  })

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
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        const name = document.getElementById('auth-name')?.value.trim() || 'Friend'
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: name })
      }
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Wrong email or password',
        'auth/email-already-in-use': 'This email is already registered',
        'auth/weak-password': 'Password is too weak',
        'auth/invalid-email': 'Invalid email',
        'auth/too-many-requests': 'Too many attempts. Try again later',
        'auth/configuration-not-found': 'Enable Email/Password in Firebase Console'
      }
      showError(map[err.code] || err.message || 'Something went wrong')
      submitBtn.disabled = false
      submitBtn.textContent = mode === 'login' ? 'Log in' : 'Create account'
    }
  })

  document.getElementById('auth-google').addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showError(err.message || 'Google sign-in failed')
      }
    }
  })

  app.querySelectorAll('.input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('auth-submit').click()
    })
  })
}

/* ========== Shell ========== */
function renderApp() {
  const app = document.getElementById('app')
  const points = getProfile().points || 0
  app.innerHTML = `
    <header class="header">
      <div class="logo" data-page="home">Vector<span>.</span></div>
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
    <p class="soft-footer">Vector · progress over pressure · ${points} ⭐</p>
  `

  app.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      currentPage = el.dataset.page
      renderApp()
    })
  })
  document.getElementById('logout-btn').addEventListener('click', () => signOut(auth))
  renderPage()
}

function renderPage() {
  const content = document.getElementById('page-content')
  switch (currentPage) {
    case 'home': content.innerHTML = pageHome(); bindHome(); break
    case 'goals': content.innerHTML = pageGoals(); bindGoals(); break
    case 'habits': content.innerHTML = pageHabits(); bindHabits(); break
    case 'journal': content.innerHTML = pageJournal(); bindJournal(); break
    case 'journey': content.innerHTML = pageJourney(); break
    case 'progress': content.innerHTML = pageProgress(); break
    case 'analytics': content.innerHTML = pageAnalytics(); break
    case 'profile': content.innerHTML = pageProfile(); bindProfile(); break
  }
}

/* ========== HOME — progress-first ========== */
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

  const pctLabel = stats.activityPct > 0
    ? `+${stats.activityPct}% activity`
    : stats.activityPct < 0
      ? `${stats.activityPct}% activity`
      : stats.total30 > 0 ? 'Steady pace' : 'Start this month'

  // Gentle streak block
  let streakHtml = ''
  if (streak > 0) {
    streakHtml = `
      <div class="gentle-card alive">
        <h3>🔥 ${streak} ${dayWord(streak)} in a row</h3>
        <p>You're on a roll. One small action today keeps it going.</p>
      </div>
    `
  } else if (since !== null && since >= 2) {
    streakHtml = `
      <div class="gentle-card paused">
        <h3>You missed a few days</h3>
        <p>That's okay. Your previous <strong>${bestStreak > 0 ? bestStreak : totalActions()}</strong> ${bestStreak === 1 ? 'day of progress' : 'days of progress'} didn't disappear. History stays.</p>
        <button class="btn" data-page="habits">Come back today →</button>
      </div>
    `
  } else if (since === 1) {
    streakHtml = `
      <div class="gentle-card paused">
        <h3>Yesterday is gone — today is open</h3>
        <p>Your past check-ins are still here. One action today starts a new streak.</p>
        <button class="btn" data-page="habits">Continue today →</button>
      </div>
    `
  } else if (totalActions() === 0) {
    streakHtml = `
      <div class="gentle-card paused">
        <h3>Your path starts with one step</h3>
        <p>Add a habit, finish a goal, or write a short journal entry.</p>
        <button class="btn" data-page="habits">Begin →</button>
      </div>
    `
  }

  // Weekly summary — always visible, emphasized on Sunday
  const weekHtml = `
    <div class="week-card">
      ${week.isSunday ? `<div class="week-badge">Sunday · weekly review</div>` : `<div class="week-badge">This week</div>`}
      <h2>Your week in Vector</h2>
      <ul class="week-list">
        <li>✨ You completed <strong>${weekStats.totalActions}</strong> actions</li>
        ${weekStats.checks > 0 ? `<li>🔥 <strong>${weekStats.checks}</strong> habit check-ins</li>` : ''}
        ${weekStats.reading > 0 ? `<li>📖 Reading on <strong>${weekStats.reading}</strong> ${dayWord(weekStats.reading)}</li>` : ''}
        ${weekStats.sport > 0 ? `<li>💪 Trained <strong>${weekStats.sport}</strong> ${weekStats.sport === 1 ? 'time' : 'times'}</li>` : ''}
        ${weekStats.journalCount > 0 ? `<li>📓 Wrote <strong>${weekStats.journalCount}</strong> journal ${weekStats.journalCount === 1 ? 'entry' : 'entries'}</li>` : ''}
        ${weekStats.goalsCount > 0 ? `<li>🎯 Finished <strong>${weekStats.goalsCount}</strong> ${weekStats.goalsCount === 1 ? 'goal' : 'goals'}</li>` : ''}
        ${weekStats.totalActions === 0 ? `<li><span>No actions yet this week — a quiet start is fine.</span></li>` : ''}
      </ul>
      ${isBestWeek && weekStats.totalActions > 0
        ? `<div class="week-best">This is your best week in the last month 🌟</div>`
        : ''}
    </div>
  `

  return `
    <section class="progress-hero">
      <h1>Hey, ${escapeHtml(name)} 👋</h1>
      <p class="hero-sub">Your progress over the last 30 days</p>
      <div class="progress-metrics">
        <div class="metric">
          <div class="metric-icon">🎯</div>
          <div class="metric-value">${stats.goals30}</div>
          <div class="metric-label">goals completed</div>
        </div>
        <div class="metric">
          <div class="metric-icon">🔥</div>
          <div class="metric-value">${stats.checks30}</div>
          <div class="metric-label">habits checked in</div>
        </div>
        <div class="metric">
          <div class="metric-icon">📖</div>
          <div class="metric-value">${stats.journal30}</div>
          <div class="metric-label">journal entries</div>
        </div>
        <div class="metric highlight">
          <div>
            <div class="metric-value">📈 ${pctLabel}</div>
            <div class="metric-label">vs previous 30 days</div>
          </div>
        </div>
      </div>
    </section>

    ${streakHtml}
    ${weekHtml}

    <section class="dashboard">
      <div class="card">
        <div class="card-icon">🎯</div>
        <h2>Goals</h2>
        <p>${getActiveGoals().length === 0 ? 'No active goals' : `${getActiveGoals().length} active`}</p>
        <button class="btn" data-page="goals">Open</button>
      </div>
      <div class="card">
        <div class="card-icon">🔥</div>
        <h2>Habits</h2>
        <p>${getHabits().length === 0 ? 'Add your first habit' : `${getHabits().length} habits`}</p>
        <button class="btn" data-page="habits">Open</button>
      </div>
      <div class="card">
        <div class="card-icon">📓</div>
        <h2>Journal</h2>
        <p>${getJournal().length === 0 ? 'No entries yet' : `${getJournal().length} entries`}</p>
        <button class="btn" data-page="journal">Write</button>
      </div>
      <div class="card">
        <div class="card-icon">🛤️</div>
        <h2>My path</h2>
        <p>${daysWithVector()} ${dayWord(daysWithVector())} with Vector</p>
        <button class="btn" data-page="journey">View path</button>
      </div>
    </section>
  `
}

function bindHome() {
  document.querySelectorAll('[data-page]').forEach(el => {
    if (el.tagName === 'BUTTON' && (el.closest('.gentle-card') || el.closest('.card'))) {
      el.addEventListener('click', () => {
        currentPage = el.dataset.page
        renderApp()
      })
    }
  })
}

/* ----- Goals ----- */
function pageGoals() {
  const active = getActiveGoals()
  const deleted = getDeletedGoals()

  const list = active.length === 0
    ? `<div class="empty-state"><div class="emoji">🌱</div><p>No goals yet. Add your first one.</p></div>`
    : `<div class="item-list">${active.map(g => `
        <div class="item">
          <div class="checkbox" data-action="complete" data-id="${g.id}" title="Complete"></div>
          <div class="item-content">
            <div class="item-title">${escapeHtml(g.title)}</div>
            <div class="item-meta">In progress · tap checkbox to complete</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${g.id}">Delete</button>
          </div>
        </div>
      `).join('')}</div>`

  return `
    <div class="page-header">
      <div>
        <h1>🎯 Goals</h1>
        <p class="subtitle">Complete once — it leaves the list. Deleted by mistake — restore below.</p>
      </div>
    </div>
    <div class="form-row">
      <input type="text" id="goal-input" class="input" placeholder="e.g. Read 10 minutes every day">
      <button class="btn" id="add-goal">Add</button>
    </div>
    ${list}
    ${deleted.length > 0 ? `
      <div class="restore-bar">
        <button class="btn btn-restore" id="restore-last">↩ Restore last deleted</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
        In trash: ${deleted.length}
      </p>
    ` : ''}
  `
}

function bindGoals() {
  document.getElementById('add-goal')?.addEventListener('click', () => {
    const input = document.getElementById('goal-input')
    const title = input.value.trim()
    if (!title) return
    const goals = getGoals()
    goals.unshift({
      id: Date.now(), title, completed: false, deleted: false,
      pointsAwarded: false, createdAt: new Date().toISOString(), completedAt: null
    })
    saveGoals(goals)
    input.value = ''
    showToast('Goal added ✨')
    renderPage()
  })
  document.getElementById('goal-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-goal').click()
  })

  document.querySelectorAll('[data-action="complete"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      const goals = getGoals()
      const g = goals.find(x => x.id === id)
      if (!g || g.completed) return
      g.completed = true
      g.deleted = false
      g.completedAt = new Date().toISOString()
      if (!g.pointsAwarded) {
        g.pointsAwarded = true
        const pts = awardDailyActivity(25)
        showToast(`Goal completed! · ${pts} ⭐`)
      } else {
        showToast('Goal completed')
      }
      saveGoals(goals)
      renderPage()
    })
  })

  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      const goals = getGoals()
      const g = goals.find(x => x.id === id)
      if (!g) return
      g.deleted = true
      g.deletedAt = new Date().toISOString()
      saveGoals(goals)
      showToast('Deleted · restore below if needed')
      renderPage()
    })
  })

  document.getElementById('restore-last')?.addEventListener('click', () => {
    const goals = getGoals()
    const deleted = goals
      .filter(g => g.deleted && !g.completed)
      .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    if (!deleted.length) return
    deleted[0].deleted = false
    deleted[0].deletedAt = null
    saveGoals(goals)
    showToast('Goal restored ↩')
    renderPage()
  })
}

/* ----- Habits ----- */
function pageHabits() {
  const habits = getHabits()
  const t = today()
  const streak = getOverallStreak()
  const bestStreak = getBestStreak()
  const since = daysSinceLastActivity()
  const week = lastNDays(7)
  const activeDays = getActiveDays()

  const calendar = week.map(day => {
    const done = activeDays.has(day)
    const isToday = day === t
    const label = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    return `<div class="streak-day ${done ? 'done' : ''} ${isToday ? 'today' : ''}">${label}</div>`
  }).join('')

  let gentle = ''
  if (streak > 0) {
    gentle = `
      <div class="gentle-card alive">
        <h3>🔥 ${streak} ${dayWord(streak)} in a row</h3>
        <p>Check in today to keep the chain alive.</p>
      </div>
    `
  } else if (since !== null && since >= 2) {
    gentle = `
      <div class="gentle-card paused">
        <h3>You missed a few days</h3>
        <p>Your previous progress is safe — best streak was <strong>${bestStreak}</strong> ${dayWord(bestStreak)}. Come back when you're ready.</p>
        <button class="btn" id="focus-today">Come back today →</button>
      </div>
    `
  }

  const list = habits.length === 0
    ? `<div class="empty-state"><div class="emoji">🌿</div><p>Add a habit and check it off each day.</p></div>`
    : `<div class="item-list">${habits.map(h => {
        const done = h.history?.includes(t)
        const hs = calcHabitStreak(h)
        return `
          <div class="item ${done ? 'done' : ''}">
            <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle" data-id="${h.id}">${done ? '✓' : ''}</div>
            <div class="item-content">
              <div class="item-title">${escapeHtml(h.title)}</div>
              <div class="item-meta">Streak: <strong>${hs}</strong> ${dayWord(hs)}${done ? ' · done today' : ''}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${h.id}">Delete</button>
            </div>
          </div>
        `
      }).join('')}</div>`

  return `
    <div class="page-header">
      <div>
        <h1>🔥 Habits</h1>
        <p class="subtitle">Progress stays even if you skip a day</p>
      </div>
    </div>
    ${gentle}
    <div class="streak-calendar">${calendar}</div>
    <div class="form-row">
      <input type="text" id="habit-input" class="input" placeholder="e.g. Read for 10 minutes">
      <button class="btn" id="add-habit">Add</button>
    </div>
    ${list}
  `
}

function bindHabits() {
  document.getElementById('focus-today')?.addEventListener('click', () => {
    document.getElementById('habit-input')?.focus()
  })

  document.getElementById('add-habit')?.addEventListener('click', () => {
    const input = document.getElementById('habit-input')
    const title = input.value.trim()
    if (!title) return
    const habits = getHabits()
    habits.unshift({ id: Date.now(), title, history: [], createdAt: new Date().toISOString() })
    saveHabits(habits)
    input.value = ''
    showToast('Habit added 🌱')
    renderPage()
  })
  document.getElementById('habit-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-habit').click()
  })

  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      const habits = getHabits()
      const h = habits.find(x => x.id === id)
      if (!h) return
      if (el.dataset.action === 'toggle') {
        if (!h.history) h.history = []
        const idx = h.history.indexOf(today())
        if (idx >= 0) {
          h.history.splice(idx, 1)
          saveHabits(habits)
          showToast('Unchecked')
        } else {
          h.history.push(today())
          saveHabits(habits)
          const hs = calcHabitStreak(h)
          const pts = awardDailyActivity(15)
          showToast(hs > 1 ? `Streak: ${hs} 🔥 · ${pts} ⭐` : `Nice start · ${pts} ⭐`)
        }
        renderPage()
      } else if (el.dataset.action === 'delete') {
        saveHabits(habits.filter(x => x.id !== id))
        showToast('Deleted')
        renderPage()
      }
    })
  })
}

/* ----- Journal ----- */
function pageJournal() {
  const entries = getJournal().sort((a, b) => b.date.localeCompare(a.date))
  const list = entries.length === 0
    ? `<div class="empty-state"><div class="emoji">🕊️</div><p>Write your first entry — even a few lines.</p></div>`
    : entries.map(e => {
        const d = new Date(e.date)
        const dateStr = d.toDateString() === new Date().toDateString() ? 'Today'
          : d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
        return `
          <div class="journal-entry">
            <div class="date">${dateStr} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="text">${escapeHtml(e.text)}</div>
            <div style="margin-top:10px">
              <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${e.id}">Delete</button>
            </div>
          </div>
        `
      }).join('')

  return `
    <div class="page-header">
      <div>
        <h1>📓 Journal</h1>
        <p class="subtitle">Writing also keeps your progress alive</p>
      </div>
    </div>
    <div style="margin-bottom:24px">
      <textarea id="entry-input" class="input" placeholder="What mattered today?"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" id="save-entry">Save</button>
        <button class="btn btn-ghost" id="clear-entry">Clear</button>
      </div>
    </div>
    ${list}
  `
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
    input.value = ''
    showToast(`Saved · ${pts} ⭐`)
    renderPage()
  })
  document.getElementById('clear-entry')?.addEventListener('click', () => {
    document.getElementById('entry-input').value = ''
  })
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      saveJournal(getJournal().filter(e => e.id !== +el.dataset.id))
      showToast('Deleted')
      renderPage()
    })
  })
}

/* ----- Journey + Path ----- */
function pageJourney() {
  const days = daysWithVector()
  const actions = totalActions()
  const checks = getHabits().reduce((s, h) => s + (h.history?.length || 0), 0)
  const goalsDone = getCompletedGoals().length
  const journalCount = getJournal().length
  const bestStreak = getBestStreak()
  const points = getProfile().points || 0
  const achievements = getAchievements()
  const months = getPathMonths()

  const pathHtml = months.map(m => `
    <div class="path-month">
      <div class="month-name">${m.label} · ${m.activeCount} active ${dayWord(m.activeCount)}</div>
      <div class="path-dots">
        ${m.dots.map(d => {
          if (d.future) return ''
          const cls = d.active ? (m.activeCount >= 15 ? 'strong' : 'active') : ''
          return `<div class="path-dot ${cls}"></div>`
        }).join('')}
      </div>
    </div>
  `).join('')

  const monthsAgo = months.length
  const intro = monthsAgo <= 1
    ? 'Your path is just beginning. Each day you show up adds a dot.'
    : `${monthsAgo} months ago you started. Every filled dot is a day you moved forward.`

  return `
    <div class="page-header">
      <div>
        <h1>🛤️ My path</h1>
        <p class="subtitle">The story of your growth — nothing is erased</p>
      </div>
    </div>

    <div class="journey-hero">
      <h2>With Vector for</h2>
      <div class="big-number">${days}</div>
      <div class="big-label">${dayWord(days)}</div>
    </div>

    <div class="journey-stats" style="margin-bottom:28px">
      <div class="stat-card"><div class="value">${actions}</div><div class="label">total actions</div></div>
      <div class="stat-card"><div class="value">${checks}</div><div class="label">habit check-ins</div></div>
      <div class="stat-card"><div class="value">${goalsDone}</div><div class="label">goals done</div></div>
      <div class="stat-card"><div class="value">${journalCount}</div><div class="label">journal entries</div></div>
      <div class="stat-card"><div class="value">${bestStreak}</div><div class="label">best streak</div></div>
      <div class="stat-card"><div class="value">${points}</div><div class="label">points ⭐</div></div>
    </div>

    <div class="section-title">My path</div>
    <p class="path-intro">${intro}</p>
    <div class="path-section">
      ${pathHtml || '<p style="color:var(--text-muted)">No history yet.</p>'}
      <div class="path-legend">
        <span><i class="lg-active"></i> Active day</span>
        <span><i class="lg-strong"></i> Strong month</span>
        <span><i class="lg-empty"></i> Quiet day</span>
      </div>
    </div>

    <div class="section-title">Achievements</div>
    <div class="achievements">
      ${achievements.map(a => `
        <div class="badge ${a.earned ? 'earned' : 'locked'}">${a.icon} ${a.title}</div>
      `).join('')}
    </div>
  `
}

function pageProgress() {
  const stats = get30DayStats()
  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()
  const monthAgo = daysAgo(30)
  let checksBefore = 0
  habits.forEach(h => (h.history || []).forEach(d => { if (d < monthAgo) checksBefore++ }))
  const journalBefore = journal.filter(e => e.date.slice(0, 10) < monthAgo).length
  const goalsBefore = goals.filter(g => g.completed && (!g.completedAt || g.completedAt.slice(0, 10) < monthAgo)).length
  const hasData = stats.total30 + checksBefore + journalBefore + goalsBefore > 0

  return `
    <div class="page-header">
      <div>
        <h1>📈 Progress</h1>
        <p class="subtitle">Last 30 days vs earlier</p>
      </div>
    </div>
    ${!hasData ? `
      <div class="empty-state">
        <div class="emoji">🌱</div>
        <p>Not enough data yet. Keep going — comparison will appear here.</p>
      </div>
    ` : `
      <div class="compare-grid">
        <div class="compare-card before">
          <h3>🌑 Earlier</h3>
          <div class="compare-row"><span>Habit check-ins</span><span class="val">${checksBefore}</span></div>
          <div class="compare-row"><span>Journal</span><span class="val">${journalBefore}</span></div>
          <div class="compare-row"><span>Goals</span><span class="val">${goalsBefore}</span></div>
        </div>
        <div class="compare-card after">
          <h3>✨ Last 30 days</h3>
          <div class="compare-row"><span>Habit check-ins</span><span class="val">${stats.checks30}</span></div>
          <div class="compare-row"><span>Journal</span><span class="val">${stats.journal30}</span></div>
          <div class="compare-row"><span>Goals</span><span class="val">${stats.goals30}</span></div>
        </div>
      </div>
      <div class="delta-card">
        <h3>Your progress this month</h3>
        <div class="delta-item"><span class="plus">+${stats.checks30}</span> check-ins</div>
        <div class="delta-item"><span class="plus">+${stats.journal30}</span> journal entries</div>
        <div class="delta-item"><span class="plus">+${stats.goals30}</span> goals completed</div>
        <div class="delta-item"><span class="plus">${stats.activityPct > 0 ? '+' : ''}${stats.activityPct}%</span> activity change</div>
      </div>
    `}
  `
}

function pageAnalytics() {
  const habits = getHabits()
  const t = today()
  const totalChecks = habits.reduce((s, h) => s + (h.history?.length || 0), 0)
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
    { value: calcLevel(), label: 'Level' }
  ]
  return `
    <div class="page-header">
      <div>
        <h1>📊 Analytics</h1>
        <p class="subtitle">All numbers — no judgment</p>
      </div>
    </div>
    <div class="stats-grid">
      ${stats.map(s => `
        <div class="stat-card">
          <div class="value">${s.value}</div>
          <div class="label">${s.label}</div>
        </div>
      `).join('')}
    </div>
  `
}

function pageProfile() {
  const profile = getProfile()
  const points = profile.points || 0
  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  return `
    <div class="page-header">
      <div>
        <h1>👤 Profile</h1>
        <p class="subtitle">A little about you</p>
      </div>
    </div>
    <div class="profile-card">
      <div class="profile-avatar">😊</div>
      <div class="profile-field">
        <label>Name</label>
        <input type="text" id="name-input" class="input" value="${escapeHtml(profile.name || '')}">
      </div>
      <div class="profile-field">
        <label>Email</label>
        <div style="color:var(--text-soft);font-size:14px">${currentUser?.email || '—'}</div>
      </div>
      <div class="profile-field">
        <label>Level</label>
        <div style="font-size:18px;font-weight:600;color:var(--blue-accent)">${calcLevel(points)}</div>
      </div>
      <div class="profile-field">
        <label>Points</label>
        <div style="font-size:18px;font-weight:600;color:var(--orange-accent)">⭐ ${points}</div>
      </div>
      <div class="profile-field">
        <label>With us since</label>
        <div style="color:var(--text-soft)">${joined}</div>
      </div>
      <button class="btn" id="save-profile">Save</button>
    </div>
  `
}

function bindProfile() {
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const profile = getProfile()
    profile.name = document.getElementById('name-input').value.trim() || 'Friend'
    saveProfile(profile)
    showToast('Saved 💛')
    renderPage()
  })
}

document.getElementById('app').innerHTML = `<div class="loading-screen">Loading…</div>`

onAuthStateChanged(auth, (user) => {
  currentUser = user
  if (user) {
    const profile = getProfile()
    if ((!profile.name || profile.name === 'Friend') && user.displayName) {
      profile.name = user.displayName
    }
    if (!profile.createdAt) profile.createdAt = new Date().toISOString()
    if (profile.points == null) profile.points = 0
    saveProfile(profile)
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
    renderApp()
  }
})

console.log('Vector v1.5 · progress over pressure')
