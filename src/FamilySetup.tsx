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

type FamilySetupMode = 'parent' | 'child'

interface FamilySetupProps {
    user: {
        uid: string
        email: string
        displayName: string
    }
}

function generateInviteCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const digits = '23456789' // ohne 0/1, weniger Verwechslungen

    let code = ''

    for (let i = 0; i < 3; i += 1) {
        const index = Math.floor(Math.random() * letters.length)
        code += letters[index]
    }

    for (let i = 0; i < 3; i += 1) {
        const index = Math.floor(Math.random() * digits.length)
        code += digits[index]
    }

    return code
}


export default function FamilySetup({ user }: FamilySetupProps) {
    const [mode, setMode] = useState<FamilySetupMode>('parent')
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
                setLoading(false)
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
        <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white px-4">
            <div className="w-full max-w-sm rounded-[36px] bg-zinc-800 px-5 py-6 shadow-2xl">
                <div className="mb-5 text-center">
                    <div className="text-base font-bold tracking-[0.25em]">
                        WEBWEB
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                        Familie wählen
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">
                        Hallo {user.displayName || user.email}
                    </div>
                </div>

                <div className="mb-4 text-sm text-zinc-200">
                    Bist du Elternteil oder Kind in dieser Familie?
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setMode('parent')
                            setError(null)
                        }}
                        className={`flex h-12 items-center justify-center rounded-2xl text-sm font-semibold ${mode === 'parent'
                            ? 'bg-sky-400 text-black'
                            : 'bg-sky-300 text-black/80'
                            }`}
                    >
                        Ich bin Elternteil
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setMode('child')
                            setError(null)
                        }}
                        className={`flex h-12 items-center justify-center rounded-2xl text-sm font-semibold ${mode === 'child'
                            ? 'bg-emerald-400 text-black'
                            : 'bg-emerald-300 text-black/80'
                            }`}
                    >
                        Ich bin Kind
                    </button>
                </div>

                {mode === 'parent' && (
                    <form onSubmit={handleCreateFamily} className="space-y-3 text-sm">
                        <div>
                            <div className="mb-1 text-xs font-medium text-zinc-200">
                                Familienname
                            </div>
                            <input
                                type="text"
                                value={familyName}
                                onChange={e => setFamilyName(e.target.value)}
                                className="w-full rounded-2xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                                placeholder="z.B. Familie Weber"
                                required
                            />
                            <div className="mt-1 text-[11px] text-zinc-400">
                                Du erstellst eine neue Familie. Der Einladungs-Code wird
                                automatisch generiert und ist danach im Eltern-Dashboard sichtbar.
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-2xl bg-red-500/20 px-3 py-2 text-xs text-red-200">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl bg-white text-base font-semibold text-zinc-900 disabled:opacity-60"
                        >
                            {loading ? 'Erstelle Familie...' : 'Familie erstellen'}
                        </button>
                    </form>
                )}

                {mode === 'child' && (
                    <form onSubmit={handleJoinFamily} className="space-y-3 text-sm">
                        <div>
                            <div className="mb-1 text-xs font-medium text-zinc-200">
                                Einladungs-Code der Familie
                            </div>
                            <input
                                type="text"
                                value={inviteCodeInput}
                                onChange={e => setInviteCodeInput(e.target.value.toUpperCase())}
                                className="w-full rounded-2xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-center text-lg font-mono tracking-[0.3em] outline-none focus:border-zinc-300"
                                placeholder="ABC123"
                                maxLength={8}
                                required
                            />
                            <div className="mt-1 text-[11px] text-zinc-400">
                                Den Code findest du im Eltern-Dashboard unter „Einstellungen“.
                                Du trittst einer bestehenden Familie bei – es wird keine neue Familie erstellt.
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-2xl bg-red-500/20 px-3 py-2 text-xs text-red-200">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl bg-white text-base font-semibold text-zinc-900 disabled:opacity-60"
                        >
                            {loading ? 'Tritt bei...' : 'Familie beitreten'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
