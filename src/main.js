import './analytics.js'
import './style.css'
import { getProfile, saveProfile } from './core/repository.js'
import { resetNavigation, setCurrentUser } from './core/state.js'
import { observeAuth } from './services/auth.js'
import { logEvent } from './services/event-log.js'
import { renderApp } from './ui/app-shell.js'
import { renderAuth } from './ui/auth-view.js'

const app = document.getElementById('app')
app.innerHTML = '<div class="loading-screen">Loading…</div>'

observeAuth(user => {
  setCurrentUser(user)

  if (user) {
    const profile = getProfile()
    if ((!profile.name || profile.name === 'Friend') && user.displayName) profile.name = user.displayName
    if (!profile.createdAt) profile.createdAt = new Date().toISOString()
    if (profile.points == null) profile.points = 0
    saveProfile(profile)
    logEvent('login', user.email || user.uid)
    renderApp()
    return
  }

  resetNavigation()
  renderAuth('login')
})

console.log('Vector 2.1 · modular architecture')
