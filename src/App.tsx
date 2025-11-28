import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { auth, db } from './firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore'
import FamilySetup from './FamilySetup'
import TaskDashboard from './TaskDashboard'

type AuthMode = 'login' | 'register'

interface UserProfile {
  uid: string
  email: string
  displayName: string
  familyId?: string | null
  role?: 'parent' | 'child' | null
}

interface Family {
  id: string
  name: string
  inviteCode: string
}

interface FamilyMember {
  uid: string
  displayName: string
  role: 'parent' | 'child'
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [family, setFamily] = useState<Family | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!currentUser) {
      setProfile(null)
      return
    }

    setProfileLoading(true)
    const ref = doc(db, 'users', currentUser.uid)
    const unsub = onSnapshot(ref, snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any
        setProfile({
          uid: data.uid ?? currentUser.uid,
          email: data.email ?? currentUser.email ?? '',
          displayName: data.displayName ?? '',
          familyId: data.familyId ?? null,
          role: data.role ?? null
        })
      } else {
        setProfile(null)
      }
      setProfileLoading(false)
    })

    return () => unsub()
  }, [currentUser])

  useEffect(() => {
    if (!profile?.familyId) {
      setFamily(null)
      setFamilyMembers([])
      return
    }

    const loadFamily = async () => {
      const ref = doc(db, 'families', profile.familyId as string)
      const snapshot = await getDoc(ref)
      if (snapshot.exists()) {
        const data = snapshot.data() as any
        setFamily({
          id: snapshot.id,
          name: data.name ?? 'Unbenannte Familie',
          inviteCode: data.inviteCode ?? ''
        })
      } else {
        setFamily(null)
      }
    }

    loadFamily()

    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('familyId', '==', profile.familyId))
    const unsubMembers = onSnapshot(q, snapshot => {
      const list: FamilyMember[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any
        return {
          uid: docSnap.id,
          displayName: data.displayName || data.email || 'Unbekannt',
          role: data.role === 'parent' ? 'parent' : 'child'
        }
      })
      setFamilyMembers(list)
    })

    return () => {
      unsubMembers()
    }
  }, [profile?.familyId])

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name,
        familyId: null,
        role: null,
        createdAt: serverTimestamp()
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler bei der Registrierung'
      setError(message)
    }
  }

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Login'
      setError(message)
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl bg-white px-6 py-4 text-lg shadow-md">
          Lädt
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-4 text-2xl font-semibold text-slate-900">
            WebWeb – Login
          </h1>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'login'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'register'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Registrieren
            </button>
          </div>

          <form
            onSubmit={mode === 'login' ? handleLogin : handleRegister}
            className="space-y-3"
          >
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {mode === 'login' ? 'Einloggen' : 'Account erstellen'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (currentUser && profile && (!profile.familyId || !profile.role)) {
    return <FamilySetup user={profile} />
  }

  const displayName = profile?.displayName || profile?.email || 'Unbekannt'
  const userRole: 'parent' | 'child' =
    profile?.role === 'parent' ? 'parent' : 'child'

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-4">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-md md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              WebWeb – Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Eingeloggt als{' '}
              <span className="font-medium">
                {displayName}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Rolle{' '}
              {profile?.role === 'parent' ? 'Elternteil' : 'Kind'} in{' '}
              {family?.name || 'unbekannter Familie'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Einladungs-Code{' '}
              <span className="font-mono">
                {family?.inviteCode || 'nicht verfügbar'}
              </span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Logout
          </button>
        </div>

        {profile?.familyId && (
          <TaskDashboard
            familyId={profile.familyId as string}
            userId={profile.uid}
            userName={displayName}
            userRole={userRole}
            members={familyMembers}
          />
        )}
      </div>
    </div>
  )
}
