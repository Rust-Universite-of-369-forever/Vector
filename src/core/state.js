const state = {
  currentUser: null,
  currentPage: 'home'
}

export function getCurrentUser() {
  return state.currentUser
}

export function setCurrentUser(user) {
  state.currentUser = user
}

export function getCurrentPage() {
  return state.currentPage
}

export function setCurrentPage(page) {
  state.currentPage = page
}

export function resetNavigation() {
  state.currentPage = 'home'
}

export function getUserId() {
  return state.currentUser?.uid || null
}
