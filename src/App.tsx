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
import ChildDashboard from './ChildDashboard'
import ParentDashboard from './ParentDashboard'

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
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">
        <div className="rounded-xl bg-zinc-800 px-6 py-4 text-lg shadow-md">
          Lädt...
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white px-4">
        <div className="w-full max-w-sm rounded-[32px] bg-zinc-800 p-6 shadow-2xl">
          <h1 className="mb-2 text-center text-sm font-bold tracking-[0.25em]">
            WEBWEB
          </h1>
          <h2 className="mb-4 text-center text-xl font-semibold">
            Login
          </h2>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${mode === 'login'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-700 text-zinc-200'
                }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${mode === 'register'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-700 text-zinc-200'
                }`}
            >
              Registrieren
            </button>
          </div>

          <form
            onSubmit={mode === 'login' ? handleLogin : handleRegister}
            className="space-y-3 text-sm"
          >
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-200">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-300"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-200">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-300"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-200">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-300"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
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

  if (currentUser && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">
        <div className="rounded-xl bg-zinc-800 px-6 py-4 text-lg shadow-md">
          Profil wird geladen...
        </div>
      </div>
    )
  }

  const displayName = profile?.displayName || profile?.email || 'Unbekannt'
  const userRole: 'parent' | 'child' =
    profile?.role === 'parent' ? 'parent' : 'child'

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white px-4">
      <div className="w-full max-w-sm sm:max-w-md">
        {userRole === 'child' ? (
          <ChildDashboard
            userId={profile!.uid}
            userName={displayName}
            familyId={profile!.familyId as string}
            familyName={family?.name || 'Familie'}
            onLogout={handleLogout}
          />
        ) : (
          <ParentDashboard
            userId={profile!.uid}
            userName={displayName}
            familyId={profile!.familyId as string}
            inviteCode={family?.inviteCode || ''}
            familyName={family?.name || 'Familie'}
            members={familyMembers}
            onLogout={handleLogout}
          />
        )}

      </div>
    </div>
  )
}
