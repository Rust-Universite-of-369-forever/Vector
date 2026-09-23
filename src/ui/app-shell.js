import { getProfile } from '../core/repository.js'
import { getCurrentPage, setCurrentPage } from '../core/state.js'
import { logEvent } from '../services/event-log.js'
import { logout } from '../services/auth.js'
import { animateRings } from '../utils/dom.js'
import { renderAnalyticsPage } from './pages/analytics.js'
import { renderGoalsPage, bindGoalsPage } from './pages/goals.js'
import { renderHabitsPage, bindHabitsPage } from './pages/habits.js'
import { renderHomePage } from './pages/home.js'
import { renderJournalPage, bindJournalPage } from './pages/journal.js'
import { renderJourneyPage } from './pages/journey.js'
import { renderProfilePage, bindProfilePage } from './pages/profile.js'
import { renderProgressPage } from './pages/progress.js'

const pages = {
  home: { render: renderHomePage, afterRender: animateRings },
  goals: { render: renderGoalsPage, bind: bindGoalsPage },
  habits: { render: renderHabitsPage, bind: bindHabitsPage },
  journal: { render: renderJournalPage, bind: bindJournalPage },
  journey: { render: renderJourneyPage },
  progress: { render: renderProgressPage },
  analytics: { render: renderAnalyticsPage },
  profile: { render: renderProfilePage, bind: bindProfilePage }
}

export function navigate(page) {
  if (!pages[page]) return
  setCurrentPage(page)
  logEvent('page_view', page)
  renderApp()
}

export function renderPage() {
  const page = pages[getCurrentPage()] || pages.home
  const content = document.getElementById('page-content')
  content.innerHTML = page.render()

  content.querySelectorAll('[data-page]').forEach(element => {
    element.addEventListener('click', () => navigate(element.dataset.page))
  })

  const context = { navigate, rerender: renderPage }
  page.bind?.(context)
  page.afterRender?.()
}

export function renderApp() {
  const app = document.getElementById('app')
  const currentPage = getCurrentPage()
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

  app.querySelectorAll('[data-page]').forEach(element => {
    element.addEventListener('click', () => navigate(element.dataset.page))
  })

  document.getElementById('logout-btn').addEventListener('click', () => {
    logEvent('logout')
    logout()
  })

  renderPage()
}
