import { useState } from 'react'
import type { FormEvent } from 'react'
import { db } from './firebase'
import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
  doc,
  query,
  where,
  getDocs
} from 'firebase/firestore'

type FamilySetupMode = 'create' | 'join'

interface FamilySetupProps {
  user: {
    uid: string
    email: string
    displayName: string
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.random() * chars.length)
    code += chars[index]
  }
  return code
}

export default function FamilySetup({ user }: FamilySetupProps) {
  const [mode, setMode] = useState<FamilySetupMode>('create')
  const [familyName, setFamilyName] = useState('')
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateFamily = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!familyName.trim()) {
      setError('Bitte gib einen Familiennamen ein.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const inviteCode = generateInviteCode()
      const familiesRef = collection(db, 'families')
      const familyDoc = await addDoc(familiesRef, {
        name: familyName.trim(),
        inviteCode,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      })

      await updateDoc(doc(db, 'users', user.uid), {
        familyId: familyDoc.id,
        role: 'parent'
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Erstellen der Familie'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinFamily = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const code = inviteCodeInput.trim().toUpperCase()
    if (!code) {
      setError('Bitte gib einen Einladungs-Code ein.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const familiesRef = collection(db, 'families')
      const q = query(familiesRef, where('inviteCode', '==', code))
      const result = await getDocs(q)

      if (result.empty) {
        setError('Keine Familie mit diesem Code gefunden.')
        return
      }

      const familyDoc = result.docs[0]

      await updateDoc(doc(db, 'users', user.uid), {
        familyId: familyDoc.id,
        role: 'child'
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Beitreten zur Familie'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">
          WebWeb – Familie auswählen
        </h1>
        <p className="mb-4 text-sm text-slate-700">
          Hallo {user.displayName || user.email}, bitte erstelle eine Familie
          oder trete mit einem Einladungs-Code bei.
        </p>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('create')
              setError(null)
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === 'create'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Familie erstellen (Elternteil)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('join')
              setError(null)
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === 'join'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Familie beitreten (Kind)
          </button>
        </div>

        {mode === 'create' && (
          <form onSubmit={handleCreateFamily} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Familienname
              </label>
              <input
                type="text"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="z.B. Familie Weber"
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
              disabled={loading}
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Erstelle Familie...' : 'Familie erstellen'}
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoinFamily} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Einladungs-Code
              </label>
              <input
                type="text"
                value={inviteCodeInput}
                onChange={e => setInviteCodeInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-slate-500"
                placeholder="z.B. ABC123"
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
              disabled={loading}
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Tritt bei...' : 'Familie beitreten'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
