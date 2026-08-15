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
    name: currentUser?.displayName || 'Друг',
    level: 'Новичок',
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

/** Active goals only (not completed, not soft-deleted) */
function getActiveGoals() {
  return getGoals().filter(g => !g.completed && !g.deleted)
}
/** Soft-deleted goals (can restore) — only last few */
function getDeletedGoals() {
  return getGoals().filter(g => g.deleted && !g.completed)
}
/** Completed goals (for stats only, not shown in list) */
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
  if (p >= 500) return 'Мастер'
  if (p >= 200) return 'Практик'
  if (p >= 50) return 'Исследователь'
  return 'Новичок'
}

function getAchievements() {
  const streak = getOverallStreak()
  const habits = getHabits()
  const goalsDone = getCompletedGoals().length
  const journal = getJournal()
  const totalChecks = habits.reduce((s, h) => s + (h.history?.length || 0), 0)
  const points = getProfile().points || 0
  return [
    { id: 'first', icon: '🌱', title: 'Первый шаг', earned: totalChecks + journal.length + goalsDone > 0 },
    { id: 's3', icon: '🔥', title: '3 дня подряд', earned: streak >= 3 },
    { id: 's7', icon: '🔥', title: 'Неделя', earned: streak >= 7 },
    { id: 's30', icon: '💎', title: 'Месяц', earned: streak >= 30 },
    { id: 'h10', icon: '✅', title: '10 отметок', earned: totalChecks >= 10 },
    { id: 'h50', icon: '🏆', title: '50 отметок', earned: totalChecks >= 50 },
    { id: 'g1', icon: '🎯', title: 'Первая цель', earned: goalsDone >= 1 },
    { id: 'g5', icon: '🌟', title: '5 целей', earned: goalsDone >= 5 },
    { id: 'j7', icon: '📓', title: 'Неделя дневника', earned: journal.length >= 7 },
    { id: 'p100', icon: '⭐', title: '100 очков', earned: points >= 100 }
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
        <p class="auth-subtitle">Спокойный путь к лучшей версии себя</p>
        <div class="auth-tabs">
          <button class="${mode === 'login' ? 'active' : ''}" data-mode="login">Вход</button>
          <button class="${mode === 'register' ? 'active' : ''}" data-mode="register">Регистрация</button>
        </div>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-field"><label>Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com"></div>
        <div class="auth-field"><label>Пароль</label>
          <input type="password" id="auth-password" class="input" placeholder="Минимум 6 символов"></div>
        ${mode === 'register' ? `<div class="auth-field"><label>Имя</label>
          <input type="text" id="auth-name" class="input" placeholder="Как к тебе обращаться?"></div>` : ''}
        <button class="btn auth-submit" id="auth-submit">${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        <div class="auth-divider">или</div>
        <button class="btn btn-google" id="auth-google">Войти через Google</button>
      </div>
    </div>`

  app.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => renderAuth(btn.dataset.mode))
  })
  const errorEl = document.getElementById('auth-error')
  const showError = (msg) => { errorEl.textContent = msg; errorEl.classList.add('show') }

  document.getElementById('auth-submit').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim()
    const password = document.getElementById('auth-password').value
    const btn = document.getElementById('auth-submit')
    if (!email || !password) { showError('Заполни email и пароль'); return }
    if (password.length < 6) { showError('Пароль не короче 6 символов'); return }
    btn.disabled = true
    btn.textContent = 'Подождите…'
    errorEl.classList.remove('show')
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password)
      else {
        const name = document.getElementById('auth-name')?.value.trim() || 'Друг'
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: name })
      }
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/email-already-in-use': 'Email уже зарегистрирован',
        'auth/configuration-not-found': 'Включи Email/Password в Firebase'
      }
      showError(map[err.code] || err.message || 'Ошибка')
      btn.disabled = false
      btn.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт'
    }
  })
  document.getElementById('auth-google').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') showError(err.message) }
  })
  app.querySelectorAll('.input').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('auth-submit').click() })
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
        <button data-page="home" class="${currentPage === 'home' ? 'active' : ''}">Главная</button>
        <button data-page="goals" class="${currentPage === 'goals' ? 'active' : ''}">Цели</button>
        <button data-page="habits" class="${currentPage === 'habits' ? 'active' : ''}">Привычки</button>
        <button data-page="journal" class="${currentPage === 'journal' ? 'active' : ''}">Дневник</button>
        <button data-page="journey" class="${currentPage === 'journey' ? 'active' : ''}">Путь</button>
        <button data-page="progress" class="${currentPage === 'progress' ? 'active' : ''}">Прогресс</button>
        <button data-page="analytics" class="${currentPage === 'analytics' ? 'active' : ''}">Аналитика</button>
        <button data-page="profile" class="profile ${currentPage === 'profile' ? 'active' : ''}">Профиль</button>
      </nav>
      <button class="btn-logout" id="logout-btn">Выйти</button>
    </header>
    <main class="container" id="page-content"></main>
    <p class="soft-footer">Vector · мягкий путь к себе · ${points} ⭐</p>`

  app.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => { currentPage = el.dataset.page; renderApp() })
  })
  document.getElementById('logout-btn').addEventListener('click', () => signOut(auth))
  renderPage()
}

function renderPage() {
  const content = document.getElementById('page-content')
  switch (currentPage) {
    case 'home': content.innerHTML = pageHome(); break
    case 'goals': content.innerHTML = pageGoals(); bindGoals(); break
    case 'habits': content.innerHTML = pageHabits(); bindHabits(); break
    case 'journal': content.innerHTML = pageJournal(); bindJournal(); break
    case 'journey': content.innerHTML = pageJourney(); break
    case 'progress': content.innerHTML = pageProgress(); break
    case 'analytics': content.innerHTML = pageAnalytics(); break
    case 'profile': content.innerHTML = pageProfile(); bindProfile(); break
  }
}

function pageHome() {
  const profile = getProfile()
  const name = profile.name || currentUser?.displayName || 'друг'
  const streak = getOverallStreak()
  const points = profile.points || 0
  const activeGoals = getActiveGoals().length
  const habits = getHabits()
  const maxHabitStreak = habits.reduce((m, h) => Math.max(m, calcHabitStreak(h)), 0)
  const journal = getJournal()
  const lastJ = journal.length ? journal.sort((a, b) => b.date.localeCompare(a.date))[0].date : null
  const lastJText = lastJ?.startsWith(today()) ? 'Сегодня' : lastJ ? lastJ.slice(0, 10) : 'Пока нет записей'
  const achievements = getAchievements().filter(a => a.earned).slice(0, 4)

  return `
    <section class="welcome-card">
      <h1>Привет, ${escapeHtml(name)} 👋</h1>
      <p>Каждый день — маленький шаг. Отметь привычку или запиши мысль — и серия продолжится.</p>
    </section>
    <div class="streak-banner">
      <div class="streak-fire">🔥</div>
      <div class="streak-info">
        <h3>${streak > 0 ? `${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} подряд` : 'Начни серию сегодня'}</h3>
        <p>${streak > 0 ? 'Сделай что-нибудь сегодня, чтобы не сбросить серию' : 'Отметь привычку, цель или запись в дневник'}</p>
      </div>
      <div class="streak-points">⭐ ${points}</div>
    </div>
    ${achievements.length ? `<div class="achievements">${achievements.map(a => `<div class="badge earned">${a.icon} ${a.title}</div>`).join('')}</div>` : ''}
    <section class="dashboard">
      <div class="card"><div class="card-icon">🎯</div><h2>Цели</h2>
        <p>${activeGoals === 0 ? 'Нет активных целей' : activeGoals === 1 ? '1 активная цель' : `${activeGoals} активных целей`}</p>
        <button class="btn" data-page="goals">Открыть</button></div>
      <div class="card"><div class="card-icon">🔥</div><h2>Привычки</h2>
        <p>${maxHabitStreak === 0 ? 'Начни отмечать сегодня' : `Лучшая серия: ${maxHabitStreak} дн.`}</p>
        <button class="btn" data-page="habits">Открыть</button></div>
      <div class="card"><div class="card-icon">📓</div><h2>Дневник</h2>
        <p>${lastJText === 'Сегодня' ? 'Есть запись сегодня' : lastJText === 'Пока нет записей' ? 'Пока нет записей' : `Последняя: ${lastJText}`}</p>
        <button class="btn" data-page="journal">Написать</button></div>
      <div class="card"><div class="card-icon">🛤️</div><h2>Твой путь</h2>
        <p>${daysWithVector()} дн. с Vector · ${points} ⭐</p>
        <button class="btn" data-page="journey">Смотреть</button></div>
    </section>`
}

/* ----- Goals: complete = remove from list (points once); soft-delete = restore from bottom ----- */
function pageGoals() {
  const active = getActiveGoals()
  const deleted = getDeletedGoals()

  const list = active.length === 0
    ? `<div class="empty-state"><div class="emoji">🌱</div><p>Пока нет целей. Добавь первую.</p></div>`
    : `<div class="item-list">${active.map(g => `
        <div class="item">
          <div class="checkbox" data-action="complete" data-id="${g.id}" title="Выполнить"></div>
          <div class="item-content">
            <div class="item-title">${escapeHtml(g.title)}</div>
            <div class="item-meta">В работе · нажми галочку, чтобы выполнить</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${g.id}">Удалить</button>
          </div>
        </div>
      `).join('')}</div>`

  return `
    <div class="page-header">
      <div>
        <h1>🎯 Мои цели</h1>
        <p class="subtitle">Выполнил — цель уходит из списка. Случайно удалил — верни кнопкой снизу.</p>
      </div>
    </div>
    <div class="form-row">
      <input type="text" id="goal-input" class="input" placeholder="Например: читать 10 минут каждый день">
      <button class="btn" id="add-goal">Добавить</button>
    </div>
    ${list}
    ${deleted.length > 0 ? `
      <div class="restore-bar">
        <button class="btn btn-restore" id="restore-last">↩ Вернуть последнюю удалённую</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
        В корзине: ${deleted.length} ${deleted.length === 1 ? 'цель' : 'целей'}
      </p>
    ` : ''}`
}

function bindGoals() {
  document.getElementById('add-goal')?.addEventListener('click', () => {
    const input = document.getElementById('goal-input')
    const title = input.value.trim()
    if (!title) return
    const goals = getGoals()
    goals.unshift({
      id: Date.now(),
      title,
      completed: false,
      deleted: false,
      pointsAwarded: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    })
    saveGoals(goals)
    input.value = ''
    showToast('Цель добавлена ✨')
    renderPage()
  })
  document.getElementById('goal-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-goal').click()
  })

  // Complete goal → remove from active list, award points ONLY once
  document.querySelectorAll('[data-action="complete"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      const goals = getGoals()
      const g = goals.find(x => x.id === id)
      if (!g || g.completed) return
      g.completed = true
      g.deleted = false
      g.completedAt = new Date().toISOString()
      let pts = getProfile().points || 0
      if (!g.pointsAwarded) {
        g.pointsAwarded = true
        pts = awardDailyActivity(25)
        showToast(`Цель выполнена! +очки · ${pts} ⭐`)
      } else {
        showToast('Цель выполнена')
      }
      saveGoals(goals)
      renderPage()
    })
  })

  // Soft delete (can restore)
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      const goals = getGoals()
      const g = goals.find(x => x.id === id)
      if (!g) return
      g.deleted = true
      g.deletedAt = new Date().toISOString()
      saveGoals(goals)
      showToast('Цель удалена · можно вернуть кнопкой снизу')
      renderPage()
    })
  })

  // Restore last soft-deleted goal (bottom button, like Add)
  document.getElementById('restore-last')?.addEventListener('click', () => {
    const goals = getGoals()
    const deleted = goals
      .filter(g => g.deleted && !g.completed)
      .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    if (!deleted.length) return
    const g = deleted[0]
    g.deleted = false
    g.deletedAt = null
    saveGoals(goals)
    showToast('Цель возвращена ↩')
    renderPage()
  })
}

/* ----- Habits ----- */
function pageHabits() {
  const habits = getHabits()
  const t = today()
  const overall = getOverallStreak()
  const points = getProfile().points || 0
  const week = lastNDays(7)
  const activeDays = getActiveDays()
  const calendar = week.map(day => {
    const done = activeDays.has(day)
    const isToday = day === t
    const label = new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' })
    return `<div class="streak-day ${done ? 'done' : ''} ${isToday ? 'today' : ''}">${label}</div>`
  }).join('')

  const list = habits.length === 0
    ? `<div class="empty-state"><div class="emoji">🌿</div><p>Добавь привычку и отмечай каждый день.</p></div>`
    : `<div class="item-list">${habits.map(h => {
        const done = h.history?.includes(t)
        const streak = calcHabitStreak(h)
        return `
          <div class="item ${done ? 'done' : ''}">
            <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle" data-id="${h.id}">${done ? '✓' : ''}</div>
            <div class="item-content">
              <div class="item-title">${escapeHtml(h.title)}</div>
              <div class="item-meta">Серия: <strong>${streak}</strong> дн.${done ? ' · сегодня ✓' : ''}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${h.id}">Удалить</button>
            </div>
          </div>`
      }).join('')}</div>`

  return `
    <div class="page-header"><div>
      <h1>🔥 Мои привычки</h1>
      <p class="subtitle">Отметил сегодня — серия +1</p>
    </div></div>
    <div class="streak-banner">
      <div class="streak-fire">🔥</div>
      <div class="streak-info">
        <h3>${overall > 0 ? `${overall} ${overall === 1 ? 'день' : overall < 5 ? 'дня' : 'дней'} подряд` : 'Серия ещё не начата'}</h3>
        <p>${overall > 0 ? 'Не пропусти день' : 'Отметь привычку сегодня'}</p>
      </div>
      <div class="streak-points">⭐ ${points}</div>
    </div>
    <div class="streak-calendar">${calendar}</div>
    <div class="form-row">
      <input type="text" id="habit-input" class="input" placeholder="Например: читать 10 минут">
      <button class="btn" id="add-habit">Добавить</button>
    </div>
    ${list}`
}

function bindHabits() {
  document.getElementById('add-habit')?.addEventListener('click', () => {
    const input = document.getElementById('habit-input')
    const title = input.value.trim()
    if (!title) return
    const habits = getHabits()
    habits.unshift({ id: Date.now(), title, history: [], createdAt: new Date().toISOString() })
    saveHabits(habits)
    input.value = ''
    showToast('Привычка добавлена 🌱')
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
          showToast('Снято')
        } else {
          h.history.push(today())
          saveHabits(habits)
          const streak = calcHabitStreak(h)
          const pts = awardDailyActivity(15)
          showToast(streak > 1 ? `Серия: ${streak} 🔥 · ${pts} ⭐` : `Серия началась · ${pts} ⭐`)
        }
        renderPage()
      } else if (el.dataset.action === 'delete') {
        saveHabits(habits.filter(x => x.id !== id))
        showToast('Удалено')
        renderPage()
      }
    })
  })
}

/* ----- Journal ----- */
function pageJournal() {
  const entries = getJournal().sort((a, b) => b.date.localeCompare(a.date))
  const list = entries.length === 0
    ? `<div class="empty-state"><div class="emoji">🕊️</div><p>Напиши первую запись.</p></div>`
    : entries.map(e => {
        const d = new Date(e.date)
        const dateStr = d.toDateString() === new Date().toDateString() ? 'Сегодня'
          : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
        return `<div class="journal-entry">
          <div class="date">${dateStr} · ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="text">${escapeHtml(e.text)}</div>
          <div style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-action="delete" data-id="${e.id}">Удалить</button></div>
        </div>`
      }).join('')

  return `
    <div class="page-header"><div>
      <h1>📓 Дневник</h1>
      <p class="subtitle">Запись тоже поддерживает серию</p>
    </div></div>
    <div style="margin-bottom:24px">
      <textarea id="entry-input" class="input" placeholder="Что сегодня было важным?"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" id="save-entry">Сохранить</button>
        <button class="btn btn-ghost" id="clear-entry">Очистить</button>
      </div>
    </div>
    ${list}`
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
    showToast(`Сохранено · ${pts} ⭐`)
    renderPage()
  })
  document.getElementById('clear-entry')?.addEventListener('click', () => {
    document.getElementById('entry-input').value = ''
  })
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      saveJournal(getJournal().filter(e => e.id !== +el.dataset.id))
      showToast('Удалено')
      renderPage()
    })
  })
}

function pageJourney() {
  const days = daysWithVector()
  const actions = totalActions()
  const checks = getHabits().reduce((s, h) => s + (h.history?.length || 0), 0)
  const goalsDone = getCompletedGoals().length
  const journalCount = getJournal().length
  const overall = getOverallStreak()
  const points = getProfile().points || 0
  const achievements = getAchievements()
  return `
    <div class="page-header"><div><h1>🛤️ Твой путь</h1><p class="subtitle">Вся история прогресса</p></div></div>
    <div class="journey-hero">
      <h2>С Vector уже</h2>
      <div class="big-number">${days}</div>
      <div class="big-label">${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</div>
    </div>
    <div class="journey-stats">
      <div class="journey-stat"><div class="num">${actions}</div><div class="lbl">действий</div></div>
      <div class="journey-stat"><div class="num">${checks}</div><div class="lbl">отметок</div></div>
      <div class="journey-stat"><div class="num">${goalsDone}</div><div class="lbl">целей</div></div>
      <div class="journey-stat"><div class="num">${journalCount}</div><div class="lbl">записей</div></div>
      <div class="journey-stat"><div class="num">${overall}</div><div class="lbl">серия</div></div>
      <div class="journey-stat"><div class="num">${points}</div><div class="lbl">очков ⭐</div></div>
    </div>
    <div class="section-title">Достижения</div>
    <div class="achievements">
      ${achievements.map(a => `<div class="badge ${a.earned ? 'earned' : 'locked'}">${a.icon} ${a.title}</div>`).join('')}
    </div>`
}

function pageProgress() {
  const habits = getHabits()
  const journal = getJournal()
  const goals = getGoals()
  const monthAgo = daysAgo(30)
  let checksLast30 = 0, checksBefore = 0
  habits.forEach(h => (h.history || []).forEach(d => { if (d >= monthAgo) checksLast30++; else checksBefore++ }))
  const journalLast30 = journal.filter(e => e.date.slice(0, 10) >= monthAgo).length
  const journalBefore = journal.length - journalLast30
  const goalsLast30 = goals.filter(g => g.completed && g.completedAt && g.completedAt.slice(0, 10) >= monthAgo).length
  const goalsBefore = goals.filter(g => g.completed && (!g.completedAt || g.completedAt.slice(0, 10) < monthAgo)).length
  const hasData = checksLast30 + journalLast30 + goalsLast30 + checksBefore + journalBefore + goalsBefore > 0

  return `
    <div class="page-header"><div><h1>📈 Прогресс</h1><p class="subtitle">За последние 30 дней</p></div></div>
    ${!hasData ? `<div class="empty-state"><div class="emoji">🌱</div><p>Пока мало данных. Отмечай привычки и цели.</p></div>` : `
      <div class="compare-grid">
        <div class="compare-card before"><h3>🌑 Ранее</h3>
          <div class="compare-row"><span>Привычки</span><span class="val">${checksBefore}</span></div>
          <div class="compare-row"><span>Дневник</span><span class="val">${journalBefore}</span></div>
          <div class="compare-row"><span>Цели</span><span class="val">${goalsBefore}</span></div>
        </div>
        <div class="compare-card after"><h3>✨ За 30 дней</h3>
          <div class="compare-row"><span>Привычки</span><span class="val">${checksLast30}</span></div>
          <div class="compare-row"><span>Дневник</span><span class="val">${journalLast30}</span></div>
          <div class="compare-row"><span>Цели</span><span class="val">${goalsLast30}</span></div>
        </div>
      </div>
      <div class="delta-card"><h3>Прогресс за месяц</h3>
        <div class="delta-item"><span class="plus">+${checksLast30}</span> отметок</div>
        <div class="delta-item"><span class="plus">+${journalLast30}</span> записей</div>
        <div class="delta-item"><span class="plus">+${goalsLast30}</span> целей</div>
      </div>`}`
}

function pageAnalytics() {
  const habits = getHabits()
  const t = today()
  const totalChecks = habits.reduce((s, h) => s + (h.history?.length || 0), 0)
  const stats = [
    { value: habits.length, label: 'Привычек' },
    { value: totalChecks, label: 'Всего отметок' },
    { value: habits.filter(h => h.history?.includes(t)).length, label: 'Сегодня' },
    { value: getOverallStreak(), label: 'Серия дней' },
    { value: habits.reduce((m, h) => Math.max(m, calcHabitStreak(h)), 0), label: 'Лучшая серия' },
    { value: getActiveGoals().length, label: 'Активные цели' },
    { value: getCompletedGoals().length, label: 'Достигнутые цели' },
    { value: getJournal().length, label: 'Записей' },
    { value: daysWithVector(), label: 'Дней с Vector' },
    { value: getProfile().points || 0, label: 'Очков ⭐' },
    { value: calcLevel(), label: 'Уровень' }
  ]
  return `
    <div class="page-header"><div><h1>📊 Аналитика</h1><p class="subtitle">Все цифры</p></div></div>
    <div class="stats-grid">${stats.map(s => `
      <div class="stat-card"><div class="value">${s.value}</div><div class="label">${s.label}</div></div>
    `).join('')}</div>`
}

function pageProfile() {
  const profile = getProfile()
  const points = profile.points || 0
  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  return `
    <div class="page-header"><div><h1>👤 Профиль</h1></div></div>
    <div class="profile-card">
      <div class="profile-avatar">😊</div>
      <div class="profile-field"><label>Имя</label>
        <input type="text" id="name-input" class="input" value="${escapeHtml(profile.name || '')}"></div>
      <div class="profile-field"><label>Email</label>
        <div style="color:var(--text-soft);font-size:14px">${currentUser?.email || '—'}</div></div>
      <div class="profile-field"><label>Уровень</label>
        <div style="font-size:18px;font-weight:600;color:var(--blue-accent)">${calcLevel(points)}</div></div>
      <div class="profile-field"><label>Очки</label>
        <div style="font-size:18px;font-weight:600;color:var(--orange-accent)">⭐ ${points}</div></div>
      <div class="profile-field"><label>С нами с</label>
        <div style="color:var(--text-soft)">${joined}</div></div>
      <button class="btn" id="save-profile">Сохранить</button>
    </div>`
}

function bindProfile() {
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const profile = getProfile()
    profile.name = document.getElementById('name-input').value.trim() || 'Друг'
    saveProfile(profile)
    showToast('Сохранено 💛')
    renderPage()
  })
}

document.getElementById('app').innerHTML = `<div class="loading-screen">Загрузка…</div>`

onAuthStateChanged(auth, (user) => {
  currentUser = user
  if (user) {
    const profile = getProfile()
    if ((!profile.name || profile.name === 'Друг') && user.displayName) profile.name = user.displayName
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

console.log('Vector v1.3.1')
