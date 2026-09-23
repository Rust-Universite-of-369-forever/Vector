import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth'
import { auth } from '../firebase.js'

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function registerWithEmail(email, password, name) {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(credential.user, { displayName: name })
  return credential
}

export function loginWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export function logout() {
  return signOut(auth)
}
