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

/* ========== Storage (localStorage, привязан к uid) ========== */
function storageKey(base, uid) {
  return uid ? `vector_${base}_${uid}` : `vector_${base}`
}

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

let currentUser = null
let currentPage = 'home'

/* ========== Helpers ========== */
const today = () => new Date().toISOString().slice(0, 10)

function uid() {
  return currentUser?.uid || null
}

function getProfile() {
  return Storage.get(storageKey('profile', uid()), {
    name: currentUser?.displayName || 'Друг',
    level: 'Новичок',
    createdAt: new Date().toISOString()
  })
}

function saveProfile(p) { Storage.set(storageKey('profile', uid()), p) }
function getHabits() { return Storage.get(storageKey('habits', uid()), []) }
function saveHabits(h) { Storage.set(storageKey('habits', uid()), h) }
function getGoals() { return Storage.get(storageKey('goals', uid()), []) }
function saveGoals(g) { Storage.set(storageKey('goals', uid()), g) }
function getJournal() { return Storage.get(storageKey('journal', uid()), []) }
function saveJournal(j) { Storage.set(storageKey('journal', uid()), j) }

function calcStreak(habit) {
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

function calcLevel() {
  const habits = getHabits()
  const goals = getGoals()
  const journal = getJournal()
  const maxStreak = habits.reduce((m, h) => Math.max(m, calcStreak(h)), 0)
  const completed = goals.filter(g => g.completed).length
  const score = maxStreak * 2 + completed * 3 + journal.length
  if (score >= 40) return 'Мастер'
  if (score >= 20) return 'Практик'
  if (score >= 8) return 'Исследователь'
  return 'Новичок'
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
  t._timer = setTimeout(() => t.classList.remove('show'), 2200)
}

/* ========== Auth UI ========== */
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

        <div class="auth-field">
          <label>Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com" autocomplete="email">
        </div>

        <div class="auth-field">
          <label>Пароль</label>
          <input type="password" id="auth-password" class="input" placeholder="Минимум 6 символов" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
        </div>

        ${mode === 'register' ? `
          <div class="auth-field">
            <label>Имя</label>
            <input type="text" id="auth-name" class="input" placeholder="Как к тебе обращаться?">
          </div>
        ` : ''}

        <button class="btn auth-submit" id="auth-submit">
          ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>

        <div class="auth-divider">или</div>

        <button class="btn btn-google" id="auth-google">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.3C9.6 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l6.2 5.2C38.5 37.2 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z"/></svg>
          Войти через Google
        </button>
      </div>
    </div>
  `

  // Tabs
  app.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => renderAuth(btn.dataset.mode))
  })

  const errorEl = document.getElementById('auth-error')
  const showError = (msg) => {
    errorEl.textContent = msg
    errorEl.classList.add('show')
  }

  // Email submit
  document.getElementById('auth-submit').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim()
    const password = document.getElementById('auth-password').value
    const submitBtn = document.getElementById('auth-submit')

    if (!email || !password) {
      showError('Заполни email и пароль')
      return
    }
    if (password.length < 6) {
      showError('Пароль должен быть не короче 6 символов')
      return
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Подождите…'
    errorEl.classList.remove('show')

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        const name = document.getElementById('auth-name')?.value.trim() || 'Друг'
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: name })
      }
      // onAuthStateChanged подхватит
    } catch (err) {
      const map = {
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/weak-password': 'Пароль слишком простой',
        'auth/invalid-email': 'Некорректный email',
        'auth/too-many-requests': 'Слишком много попыток. Попробуй позже'
      }
      showError(map[err.code] || err.message || 'Ошибка входа')
      submitBtn.disabled = false
      submitBtn.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт'
    }
  })

  // Google
  document.getElementById('auth-google').addEventListener('click', async () => {
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showError(err.message || 'Ошибка входа через Google')
      }
    }
  })

  // Enter key
  app.querySelectorAll('.input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('auth-submit').click()
    })
  })
}

/* ========== Main App ========== */
function renderApp() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <header class="header">
      <div class="logo" data-page="home">Vector<span>.</span></div>
      <nav class="menu">
        <button data-page="home" class="${currentPage === 'home' ? 'active' : ''}">Главная</button>
        <button data-page="goals" class="${currentPage === 'goals' ? 'active' : ''}">Цели</button>
        <button data-page="habits" class="${currentPage === 'habits' ? 'active' : ''}">Привычки</button>
        <button data-page="journal" class="${currentPage === 'journal' ? 'active' : ''}">Дневник</button>
        <button data-page="analytics" class="${currentPage === 'analytics' ? 'active' : ''}">Аналитика</button>
        <button data-page="profile" class="profile ${currentPage === 'profile' ? 'active' : ''}">Профиль</button>
      </nav>
      <button class="btn-logout" id="logout-btn">Выйти</button>
    </header>
    <main class="container" id="page-content"></main>
    <p class="soft-footer">Vector · мягкий путь к себе</p>
  `

  app.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      currentPage = el.dataset.page
      renderApp()
    })
  })

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth)
  })

  renderPage()
}

function renderPage() {
  const content = document.getElementById('page-content')
  switch (currentPage) {
    case 'home': content.innerHTML = pageHome(); break
    case 'goals': content.innerHTML = pageGoals(); bindGoals(); break
    case 'habits': content.innerHTML = pageHabits(); bindHabits(); break
    case 'journal': content.innerHTML = pageJournal(); bindJournal(); break
    case 'analytics': content.innerHTML = pageAnalytics(); break
    case 'profile': content.innerHTML = pageProfile(); bindProfile(); break
  }
}

/* ----- Pages (same as before) ----- */
function pageHome() {
  const goals = getGoals()
  const habits = getHabits()
  const journal = getJournal()
  const profile = getProfile()
  const activeGoals = goals.filter(g => !g.completed).length
  const maxStreak = habits.reduce((m, h) => Math.max(m, calcStreak(h)), 0)
  const lastJ = journal.length
    ? journal.sort((a, b) => b.date.localeCompare(a.date))[0].date
    : null
  const lastJText = lastJ?.startsWith(today()) ? 'Сегодня'
    : lastJ ? lastJ.slice(0, 10) : 'Пока нет записей'
  const name = profile.name || currentUser?.displayName || 'друг'

  return `
    <section class="welcome-card">
      <h1>Привет, ${escapeHtml(name)} 👋</h1>
      <p>Каждый день — маленький шаг к лучшей версии себя. Здесь спокойно и без спешки.</p>
    </section>
    <section class="dashboard">
      <div class="card">
        <div class="card-icon">🎯</div>
        <h2>Цели</h2>
        <p>${activeGoals === 0 ? 'Пока нет активных целей' : activeGoals === 1 ? '1 активная цель' : `${activeGoals} активные цели`}</p>
        <button class="btn" data-page="goals">Посмотреть</button>
      </div>
      <div class="card">
        <div class="card-icon">🔥</div>
        <h2>Привычки</h2>
        <p>${maxStreak === 0 ? 'Начни серию сегодня' : `Серия: ${maxStreak} ${maxStreak === 1 ? 'день' : 'дней'}`}</p>
        <button class="btn" data-page="habits">Открыть</button>
      </div>
      <div class="card">
        <div class="card-icon">📓</div>
        <h2>Дневник</h2>
        <p>${lastJText === 'Сегодня' ? 'Запись есть сегодня' : lastJText === 'Пока нет записей' ? 'Пока нет записей' : `Последняя: ${lastJText}`}</p>
        <button class="btn" data-page="journal">Написать</button>
      </div>
      <div class="card">
        <div class="card-icon">📊</div>
        <h2>Прогресс</h2>
        <p>Ваш уровень: ${profile.level || calcLevel()}</p>
        <button class="btn" data-page="analytics">Подробнее</button>
      </div>
    </section>
  `
}

function pageGoals() {
  const goals = getGoals()
  const list = goals.length === 0
    ? `<div class="empty-state"><div class="emoji">🌱</div><p>Пока нет целей. Добавь первую — и путь начнётся.</p></div>`
    : `<div class="item-list">${goals.map((g, i) => `
        <div class="item ${g.completed ? 'done' : ''}">
          <div class="checkbox ${g.completed ? 'checked' : ''}" data-action="toggle" data-i="${i}">${g.completed ? '✓' : ''}</div>
          <div class="item-content">
            <div class="item-title">${escapeHtml(g.title)}</div>
            <div class="item-meta">${g.completed ? 'Выполнено' : 'В процессе'}${g.progress != null ? ` · ${g.progress}%` : ''}</div>
            ${!g.completed ? `<div class="progress-bar"><div class="progress-fill" style="width:${g.progress || 0}%"></div></div>` : ''}
          </div>
          <div class="item-actions">
            ${!g.completed ? `<button class="btn btn-sm btn-secondary" data-action="progress" data-i="${i}">+10%</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-action="delete" data-i="${i}">Удалить</button>
          </div>
        </div>
      `).join('')}</div>`

  return `
    <div class="page-header">
      <div>
        <h1>🎯 Мои цели</h1>
        <p class="subtitle">Маленькие шаги к большим переменам</p>
      </div>
    </div>
    <div class="form-row">
      <input type="text" id="goal-input" class="input" placeholder="Новая цель… например, прочитать 12 книг">
      <button class="btn" id="add-goal">Добавить</button>
    </div>
    ${list}
  `
}

function bindGoals() {
  document.getElementById('add-goal')?.addEventListener('click', () => {
    const input = document.getElementById('goal-input')
    const title = input.value.trim()
    if (!title) return
    const goals = getGoals()
    goals.unshift({ id: Date.now(), title, completed: false, progress: 0, createdAt: new Date().toISOString() })
    saveGoals(goals)
    input.value = ''
    showToast('Цель добавлена ✨')
    renderPage()
  })
  document.getElementById('goal-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-goal').click()
  })
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const i = +el.dataset.i
      const goals = getGoals()
      if (el.dataset.action === 'toggle') {
        goals[i].completed = !goals[i].completed
        if (goals[i].completed) goals[i].progress = 100
        saveGoals(goals)
        showToast(goals[i].completed ? 'Цель выполнена 🎉' : 'Цель снова в работе')
      } else if (el.dataset.action === 'progress') {
        goals[i].progress = Math.min(100, (goals[i].progress || 0) + 10)
        if (goals[i].progress >= 100) {
          goals[i].completed = true
          showToast('Цель достигнута! 🌟')
        } else showToast(`Прогресс: ${goals[i].progress}%`)
        saveGoals(goals)
      } else if (el.dataset.action === 'delete') {
        goals.splice(i, 1)
        saveGoals(goals)
        showToast('Цель удалена')
      }
      renderPage()
    })
  })
}

function pageHabits() {
  const habits = getHabits()
  const t = today()
  const list = habits.length === 0
    ? `<div class="empty-state"><div class="emoji">🌿</div><p>Пока нет привычек. Начни с одной простой — и строй серию.</p></div>`
    : `<div class="item-list">${habits.map((h, i) => {
        const done = h.history?.includes(t)
        const streak = calcStreak(h)
        return `
          <div class="item ${done ? 'done' : ''}">
            <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle" data-i="${i}">${done ? '✓' : ''}</div>
            <div class="item-content">
              <div class="item-title">${escapeHtml(h.title)}</div>
              <div class="item-meta">Серия: <strong>${streak}</strong> ${streak === 1 ? 'день' : 'дней'}${done ? ' · сегодня выполнено' : ''}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-ghost" data-action="delete" data-i="${i}">Удалить</button>
            </div>
          </div>
        `
      }).join('')}</div>`

  return `
    <div class="page-header">
      <div>
        <h1>🔥 Мои привычки</h1>
        <p class="subtitle">Маленькие действия каждый день</p>
      </div>
    </div>
    <div class="form-row">
      <input type="text" id="habit-input" class="input" placeholder="Новая привычка… например, медитация 10 мин">
      <button class="btn" id="add-habit">Добавить</button>
    </div>
    ${list}
  `
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
      const i = +el.dataset.i
      const habits = getHabits()
      if (el.dataset.action === 'toggle') {
        const h = habits[i]
        if (!h.history) h.history = []
        const idx = h.history.indexOf(today())
        if (idx >= 0) {
          h.history.splice(idx, 1)
          showToast('Отмечено как невыполненное')
        } else {
          h.history.push(today())
          const streak = calcStreak(h)
          showToast(streak > 1 ? `Серия: ${streak} дней! 🔥` : 'Отлично, первый день ✨')
        }
        saveHabits(habits)
      } else if (el.dataset.action === 'delete') {
        habits.splice(i, 1)
        saveHabits(habits)
        showToast('Привычка удалена')
      }
      renderPage()
    })
  })
}

function pageJournal() {
  const entries = getJournal().sort((a, b) => b.date.localeCompare(a.date))
  const list = entries.length === 0
    ? `<div class="empty-state"><div class="emoji">🕊️</div><p>Пока нет записей. Напиши первую — даже пару строк уже достаточно.</p></div>`
    : entries.map(e => {
        const d = new Date(e.date)
        const dateStr = d.toDateString() === new Date().toDateString() ? 'Сегодня'
          : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        return `
          <div class="journal-entry">
            <div class="date">${dateStr} · ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="text">${escapeHtml(e.text)}</div>
            <div style="margin-top:10px">
              <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${e.id}">Удалить</button>
            </div>
          </div>
        `
      }).join('')

  return `
    <div class="page-header">
      <div>
        <h1>📓 Личный дневник</h1>
        <p class="subtitle">Место для мыслей, благодарности и рефлексии</p>
      </div>
    </div>
    <div style="margin-bottom:24px">
      <textarea id="entry-input" class="input" placeholder="Что сегодня было важным? Что чувствуешь? За что благодарен?"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="save-entry">Сохранить запись</button>
        <button class="btn btn-ghost" id="clear-entry">Очистить</button>
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
    input.value = ''
    showToast('Запись сохранена 📝')
    renderPage()
  })
  document.getElementById('clear-entry')?.addEventListener('click', () => {
    document.getElementById('entry-input').value = ''
    document.getElementById('entry-input').focus()
  })
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.id
      saveJournal(getJournal().filter(e => e.id !== id))
      showToast('Запись удалена')
      renderPage()
    })
  })
}

function pageAnalytics() {
  const habits = getHabits()
  const goals = getGoals()
  const journal = getJournal()
  const profile = getProfile()
  const t = today()

  const activeGoals = goals.filter(g => !g.completed).length
  const completedGoals = goals.filter(g => g.completed).length
  const maxStreak = habits.reduce((m, h) => Math.max(m, calcStreak(h)), 0)
  const doneToday = habits.filter(h => h.history?.includes(t)).length
  const totalHabits = habits.length
  const journalToday = journal.some(e => e.date.startsWith(t))

  const stats = [
    { value: activeGoals, label: 'Активные цели' },
    { value: completedGoals, label: 'Достигнутые цели' },
    { value: maxStreak, label: 'Лучшая серия' },
    { value: totalHabits ? `${doneToday}/${totalHabits}` : '0', label: 'Привычки сегодня' },
    { value: journal.length, label: 'Записей в дневнике' },
    { value: profile.level || calcLevel(), label: 'Уровень' }
  ]

  let summary = []
  if (totalHabits === 0 && activeGoals === 0 && journal.length === 0) {
    summary.push('Пока данных мало — это нормально. Начни с одной привычки или цели.')
  } else {
    if (doneToday > 0) summary.push(`Сегодня отмечено ${doneToday} из ${totalHabits} привычек.`)
    else if (totalHabits > 0) summary.push('Сегодня ещё можно отметить привычки.')
    if (journalToday) summary.push('В дневнике уже есть запись за сегодня.')
    else summary.push('Можно написать пару строк в дневник — это всегда полезно.')
    if (maxStreak >= 3) summary.push(`Отличная серия: ${maxStreak} дней подряд!`)
  }

  return `
    <div class="page-header">
      <div>
        <h1>📊 Аналитика</h1>
        <p class="subtitle">Твой прогресс в цифрах — спокойно и честно</p>
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
    <div class="card" style="margin-top:8px">
      <h2 style="margin-bottom:10px;font-size:16px">Сегодня</h2>
      <p style="color:var(--text-soft);font-size:14px;line-height:1.6">${summary.join(' ')}</p>
    </div>
  `
}

function pageProfile() {
  const profile = getProfile()
  const level = calcLevel()
  profile.level = level
  saveProfile(profile)

  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  return `
    <div class="page-header">
      <div>
        <h1>👤 Профиль</h1>
        <p class="subtitle">Немного о тебе</p>
      </div>
    </div>
    <div class="profile-card">
      <div class="profile-avatar">😊</div>
      <div class="profile-field">
        <label for="name-input">Имя</label>
        <input type="text" id="name-input" class="input" value="${escapeHtml(profile.name || currentUser?.displayName || '')}" placeholder="Как к тебе обращаться?">
      </div>
      <div class="profile-field">
        <label>Email</label>
        <div style="color:var(--text-soft);font-size:14px">${currentUser?.email || '—'}</div>
      </div>
      <div class="profile-field">
        <label>Уровень</label>
        <div style="font-size:18px;font-weight:600;color:var(--blue-accent)">${level}</div>
      </div>
      <div class="profile-field">
        <label>С нами с</label>
        <div style="color:var(--text-soft)">${joined}</div>
      </div>
      <button class="btn" id="save-profile" style="margin-top:8px">Сохранить</button>
    </div>
  `
}

function bindProfile() {
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const profile = getProfile()
    profile.name = document.getElementById('name-input').value.trim() || 'Друг'
    profile.level = calcLevel()
    saveProfile(profile)
    showToast('Профиль сохранён 💛')
    renderPage()
  })
}

/* ========== Auth State ========== */
document.getElementById('app').innerHTML = `<div class="loading-screen">Загрузка…</div>`

onAuthStateChanged(auth, (user) => {
  currentUser = user
  if (user) {
    // Если имя ещё не сохранено — берём из Google/регистрации
    const profile = getProfile()
    if ((!profile.name || profile.name === 'Друг') && user.displayName) {
      profile.name = user.displayName
      saveProfile(profile)
    }
    renderApp()
  } else {
    currentPage = 'home'
    renderAuth('login')
  }
})

// Делегирование кнопок на главной
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-page]')
  if (btn && btn.tagName === 'BUTTON' && btn.closest('.card')) {
    currentPage = btn.dataset.page
    renderApp()
  }
})

console.log('Vector · с авторизацией')
