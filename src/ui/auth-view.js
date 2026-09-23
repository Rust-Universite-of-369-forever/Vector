import { loginWithEmail, loginWithGoogle, registerWithEmail } from '../services/auth.js'

export function renderAuth(mode = 'login') {
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

  app.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => renderAuth(button.dataset.mode))
  })

  const errorElement = document.getElementById('auth-error')
  const showError = message => {
    errorElement.textContent = message
    errorElement.classList.add('show')
  }

  document.getElementById('auth-submit').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim()
    const password = document.getElementById('auth-password').value
    const submitButton = document.getElementById('auth-submit')

    if (!email || !password) {
      showError('Please enter email and password')
      return
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters')
      return
    }

    submitButton.disabled = true
    submitButton.textContent = 'Please wait…'
    errorElement.classList.remove('show')

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password)
      } else {
        const name = document.getElementById('auth-name')?.value.trim() || 'Friend'
        await registerWithEmail(email, password, name)
      }
    } catch (error) {
      const messages = {
        'auth/invalid-credential': 'Wrong email or password',
        'auth/email-already-in-use': 'This email is already registered',
        'auth/configuration-not-found': 'Enable Email/Password in Firebase Console'
      }
      showError(messages[error.code] || error.message || 'Something went wrong')
      submitButton.disabled = false
      submitButton.textContent = mode === 'login' ? 'Log in' : 'Create account'
    }
  })

  document.getElementById('auth-google').addEventListener('click', async () => {
    try {
      await loginWithGoogle()
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') showError(error.message || 'Google sign-in failed')
    }
  })

  app.querySelectorAll('.input').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') document.getElementById('auth-submit').click()
    })
  })
}
