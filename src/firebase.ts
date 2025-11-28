import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBmV8r25DyGgDA7t2vBYMISo1pg2jpLfQ0",
  authDomain: "webwebwtf.firebaseapp.com",
  projectId: "webwebwtf",
  storageBucket: "webwebwtf.firebasestorage.app",
  messagingSenderId: "1056261129310",
  appId: "1:1056261129310:web:2f04763dca9a7ed06460cf",
  measurementId: "G-6FXT7C3BE7"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
