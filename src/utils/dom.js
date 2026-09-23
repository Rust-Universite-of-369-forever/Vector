export function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function showToast(message) {
  let toast = document.querySelector('.toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.className = 'toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2400)
}

export function ringSVG(percent, valueLabel) {
  const circumference = 138.2
  const normalizedPercent = Math.min(100, Math.max(0, percent))
  const offset = circumference - (normalizedPercent / 100) * circumference
  return `<div class="metric-ring"><svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="22"></circle><circle class="fill" cx="28" cy="28" r="22" style="stroke-dashoffset:${offset}"></circle></svg><div class="ring-value">${valueLabel}</div></div>`
}

export function animateRings() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.metric-ring .fill').forEach(element => {
      const target = element.style.strokeDashoffset
      element.style.strokeDashoffset = '138.2'
      requestAnimationFrame(() => {
        element.style.strokeDashoffset = target
      })
    })
  })
}
