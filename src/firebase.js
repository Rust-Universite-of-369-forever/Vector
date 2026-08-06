/**
 * Firebase configuration
 *
 * 1. Firebase Console → Project Settings → Your apps → скопируй конфиг
 * 2. Вставь значения ниже
 * 3. Authentication → Sign-in method → включи Email/Password и Google
 * 4. Firestore → создай базу (если ещё нет)
 */

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAMfnBXuA0qga3keYReU8rbdczMfbhdOto",                    // ← замени
  authDomain: "vector-app-19a22.firebaseapp.com",
  projectId: "vector-app-19a22",
  storageBucket: "vector-app-19a22.firebasestorage.app",
  messagingSenderId: "879054268378",
  appId: "1:879054268378:web:ac4e3cf9a1b353705942e3"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
