import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { db } from './firebase'
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where
} from 'firebase/firestore'

type TaskStatus = 'open' | 'done'

interface Task {
    id: string
    familyId: string
    title: string
    description?: string
    status: TaskStatus
    isOpen: boolean
    assigneeId?: string | null
    assigneeName?: string | null
    dueDate?: Date | null
    createdAt?: Date | null
    requiresInput?: boolean
    inputType?: 'text' | 'text+date'
    proposedChange?: {
        proposedById: string
        proposedByName?: string
        newDueDate?: Date | null
        status?: 'pending' | 'accepted' | 'rejected'
    } | null
}

interface TaskSubmission {
    id: string
    taskId: string
    userId: string
    note?: string | null
    date?: Date | null
}

interface ChildDashboardProps {
    userId: string
    userName: string
    familyId: string
    familyName: string
    onLogout: () => void
}

type CardColor = 'blue' | 'orange' | 'red' | 'green'

function getCardColor(task: Task): CardColor {
    if (task.status === 'done') return 'green'
    if (!task.dueDate) return 'blue'
    const now = Date.now()
    const diffMs = task.dueDate.getTime() - now
    const oneDayMs = 24 * 60 * 60 * 1000
    if (diffMs < 0) return 'red'
    if (diffMs <= oneDayMs) return 'orange'
    return 'blue'
}

function getColorClasses(color: CardColor) {
    if (color === 'red') return 'bg-red-400 text-black'
    if (color === 'orange') return 'bg-amber-300 text-black'
    if (color === 'blue') return 'bg-sky-400 text-black'
    return 'bg-emerald-400 text-black'
}

export default function ChildDashboard({
    userId,
    userName,
    familyId,
    familyName,
    onLogout
}: ChildDashboardProps) {
    const [tasks, setTasks] = useState<Task[]>([])
    const [submissions, setSubmissions] = useState<TaskSubmission[]>([])
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
    const [proposalTaskId, setProposalTaskId] = useState<string | null>(null)
    const [proposalDate, setProposalDate] = useState('')
    const [inputNote, setInputNote] = useState('')
    const [inputDate, setInputDate] = useState('')
    const [savingInputTaskId, setSavingInputTaskId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const tasksRef = collection(db, 'tasks')
        const q = query(tasksRef, where('familyId', '==', familyId))

        const unsub = onSnapshot(q, snapshot => {
            const list: Task[] = snapshot.docs.map(docSnap => {
                const data = docSnap.data() as any
                const due =
                    data.dueDate && data.dueDate.toDate ? data.dueDate.toDate() : null
                const created =
                    data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null

                let proposed: Task['proposedChange'] = null
                if (data.proposedChange) {
                    const pc = data.proposedChange
                    const newDue =
                        pc.newDueDate && pc.newDueDate.toDate
                            ? pc.newDueDate.toDate()
                            : null
                    proposed = {
                        proposedById: pc.proposedById,
                        proposedByName: pc.proposedByName,
                        newDueDate: newDue,
                        status: pc.status
                    }
                }

                return {
                    id: docSnap.id,
                    familyId: data.familyId,
                    title: data.title ?? '',
                    description: data.description ?? '',
                    status: (data.status as TaskStatus) ?? 'open',
                    isOpen: data.isOpen ?? false,
                    assigneeId: data.assigneeId ?? null,
                    assigneeName: data.assigneeName ?? null,
                    dueDate: due,
                    createdAt: created,
                    requiresInput: data.requiresInput ?? false,
                    inputType: data.inputType ?? undefined,
                    proposedChange: proposed
                }
            })

            list.sort((a, b) => {
                if (!a.createdAt && !b.createdAt) return 0
                if (!a.createdAt) return 1
                if (!b.createdAt) return -1
                return a.createdAt.getTime() - b.createdAt.getTime()
            })

            setTasks(list)
            setLoading(false)
        })

        return () => unsub()
    }, [familyId])

    useEffect(() => {
        const submissionsRef = collection(db, 'taskSubmissions')
        const q = query(
            submissionsRef,
            where('familyId', '==', familyId),
            where('userId', '==', userId)
        )

        const unsub = onSnapshot(q, snapshot => {
            const list: TaskSubmission[] = snapshot.docs.map(docSnap => {
                const data = docSnap.data() as any
                const date =
                    data.date && data.date.toDate ? data.date.toDate() : null
                return {
                    id: docSnap.id,
                    taskId: data.taskId,
                    userId: data.userId,
                    note: data.note ?? null,
                    date
                }
            })
            setSubmissions(list)
        })

        return () => unsub()
    }, [familyId, userId])

    const relevantTasks = useMemo(
        () =>
            tasks.filter(task => {
                if (task.assigneeId === userId) return true
                if (!task.assigneeId && task.isOpen) return true
                if (task.requiresInput) return true
                return false
            }),
        [tasks, userId]
    )

    const openTasks = relevantTasks.filter(t => t.status === 'open')
    const doneTasks = relevantTasks.filter(t => t.status === 'done')

    const getSubmissionForTask = (taskId: string) =>
        submissions.find(s => s.taskId === taskId)

    const handleToggleExpand = (taskId: string) => {
        if (expandedTaskId === taskId) {
            setExpandedTaskId(null)
            setInputNote('')
            setInputDate('')
            return
        }
        setExpandedTaskId(taskId)
        const existing = getSubmissionForTask(taskId)
        setInputNote(existing?.note ?? '')
        setInputDate(
            existing?.date ? existing.date.toISOString().slice(0, 10) : ''
        )
    }

    const handleSaveInput = async (task: Task, e: FormEvent) => {
        e.preventDefault()
        setError(null)
        setSavingInputTaskId(task.id)

        try {
            const existing = getSubmissionForTask(task.id)
            let dateValue: Timestamp | null = null
            if (inputDate) {
                const d = new Date(inputDate + 'T00:00:00')
                if (!Number.isNaN(d.getTime())) {
                    dateValue = Timestamp.fromDate(d)
                }
            }

            if (existing) {
                const ref = doc(db, 'taskSubmissions', existing.id)
                await updateDoc(ref, {
                    note: inputNote.trim() || null,
                    date: dateValue
                })
            } else {
                const ref = collection(db, 'taskSubmissions')
                await addDoc(ref, {
                    familyId,
                    taskId: task.id,
                    userId,
                    note: inputNote.trim() || null,
                    date: dateValue,
                    createdAt: serverTimestamp()
                })
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Speichern'
            setError(message)
        } finally {
            setSavingInputTaskId(null)
        }
    }

    const handleMarkDone = async (task: Task) => {
        setError(null)
        try {
            const ref = doc(db, 'tasks', task.id)
            await updateDoc(ref, {
                status: 'done',
                assigneeId: task.assigneeId || userId,
                assigneeName: task.assigneeName || userName
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Aktualisieren'
            setError(message)
        }
    }

    const handleOpenProposal = (taskId: string) => {
        if (proposalTaskId === taskId) {
            setProposalTaskId(null)
            setProposalDate('')
            return
        }
        setProposalTaskId(taskId)
        setProposalDate('')
    }

    const handleSendProposal = async (task: Task, e: FormEvent) => {
        e.preventDefault()
        if (!proposalDate) return
        setError(null)
        try {
            const date = new Date(proposalDate + 'T00:00:00')
            const ref = doc(db, 'tasks', task.id)
            await updateDoc(ref, {
                proposedChange: {
                    proposedById: userId,
                    proposedByName: userName,
                    newDueDate: Timestamp.fromDate(date),
                    status: 'pending',
                    createdAt: serverTimestamp()
                }
            })
            setProposalTaskId(null)
            setProposalDate('')
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Vorschlag'
            setError(message)
        }
    }

    const renderTaskCard = (task: Task, isDoneSection: boolean) => {
        const color = getCardColor(task)
        const colorClasses = getColorClasses(color)
        const mySubmission = getSubmissionForTask(task.id)
        const showInputArea =
            task.requiresInput && task.inputType && expandedTaskId === task.id
        const hasInput = !!mySubmission || (!!inputNote || !!inputDate)
        const canShowDoneButton =
            task.status === 'open' &&
            (!task.requiresInput || (task.requiresInput && hasInput))

        return (
            <div
                key={task.id}
                className={`mb-4 rounded-3xl px-4 py-3 text-sm shadow-md ${colorClasses}`}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <div className="text-base font-semibold uppercase tracking-wide">
                            {task.title}
                        </div>
                        {task.dueDate && (
                            <div className="mt-1 text-xs leading-snug">
                                {task.dueDate.toLocaleDateString()}
                                <br />
                                {task.dueDate.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {task.status === 'open' && (
                            <button
                                type="button"
                                onClick={() => handleOpenProposal(task.id)}
                                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-2xl"
                                title="Anderes Datum vorschlagen"
                            >
                                🙏
                            </button>
                        )}
                        {canShowDoneButton && (
                            <button
                                type="button"
                                onClick={() => handleMarkDone(task)}
                                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-2xl"
                                title="Aufgabe erledigt"
                            >
                                👍
                            </button>
                        )}
                        {task.status === 'done' && isDoneSection && (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-2xl">
                                👍
                            </div>
                        )}
                    </div>
                </div>

                {proposalTaskId === task.id && task.status === 'open' && (
                    <form
                        onSubmit={e => handleSendProposal(task, e)}
                        className="mt-3 rounded-2xl bg-white/80 p-3 text-sm text-zinc-900"
                    >
                        <div className="mb-2 text-sm font-semibold">
                            Neues Datum vorschlagen
                        </div>
                        <input
                            type="date"
                            value={proposalDate}
                            onChange={e => setProposalDate(e.target.value)}
                            className="mb-2 w-full rounded-xl border border-zinc-400 px-3 py-2 text-sm outline-none"
                            required
                        />
                        <button
                            type="submit"
                            className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white"
                        >
                            Vorschlag senden
                        </button>
                    </form>
                )}

                {task.requiresInput && task.inputType && (
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={() => handleToggleExpand(task.id)}
                            className="flex h-11 w-full items-center justify-center rounded-xl bg-black/15 px-3 text-sm font-semibold"
                        >
                            {expandedTaskId === task.id
                                ? 'Eingaben ausblenden'
                                : 'Details eingeben'}
                        </button>

                        {showInputArea && (
                            <form
                                onSubmit={e => handleSaveInput(task, e)}
                                className="mt-3 rounded-2xl bg-white/85 p-3 text-sm text-zinc-900"
                            >
                                {(task.inputType === 'text' ||
                                    task.inputType === 'text+date') && (
                                        <div className="mb-3">
                                            <div className="mb-1 text-sm font-semibold">
                                                Beschreibung / Gericht
                                            </div>
                                            <input
                                                type="text"
                                                value={inputNote}
                                                onChange={e => setInputNote(e.target.value)}
                                                className="w-full rounded-xl border border-zinc-400 px-3 py-2 text-sm outline-none"
                                                placeholder="z.B. Hörnli mit Hackfleisch"
                                            />
                                        </div>
                                    )}

                                {task.inputType === 'text+date' && (
                                    <div className="mb-3">
                                        <div className="mb-1 text-sm font-semibold">
                                            Datum wählen
                                        </div>
                                        <input
                                            type="date"
                                            value={inputDate}
                                            onChange={e => setInputDate(e.target.value)}
                                            className="w-full rounded-xl border border-zinc-400 px-3 py-2 text-sm outline-none"
                                        />
                                    </div>
                                )}

                                {mySubmission && (
                                    <div className="mb-3 rounded-xl bg-zinc-100 p-3 text-xs text-zinc-800">
                                        <div className="mb-1 font-semibold">
                                            Deine aktuelle Eingabe:
                                        </div>
                                        {mySubmission.note && (
                                            <div>{mySubmission.note}</div>
                                        )}
                                        {mySubmission.date && (
                                            <div>
                                                {mySubmission.date.toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={savingInputTaskId === task.id}
                                    className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                    {savingInputTaskId === task.id
                                        ? 'Speichere...'
                                        : 'Eingaben speichern'}
                                </button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="rounded-[36px] bg-zinc-800 px-5 py-6 text-white shadow-2xl">
            <div className="mb-5 text-center">
                <div className="text-base font-bold tracking-[0.25em]">
                    WEBWEB
                </div>
                <div className="mt-2 text-2xl font-semibold">
                    Hallo {userName}
                </div>
                <div className="mt-1 text-sm text-zinc-300">
                    {familyName}
                </div>
            </div>


            <div className="mb-4 border-t border-zinc-700" />

            <div className="max-h-[55vh] overflow-y-auto pb-2 pr-1">
                {loading && (
                    <div className="py-4 text-center text-sm text-zinc-300">
                        Lade deine Aufgaben...
                    </div>
                )}

                {!loading && openTasks.length === 0 && doneTasks.length === 0 && (
                    <div className="py-4 text-center text-sm text-zinc-300">
                        Du hast gerade keine Aufgaben 🎉
                    </div>
                )}

                {openTasks.map(task => renderTaskCard(task, false))}

                {openTasks.length > 0 && doneTasks.length > 0 && (
                    <div className="my-3 border-t border-zinc-700" />
                )}

                {doneTasks.map(task => renderTaskCard(task, true))}
            </div>

            {error && (
                <div className="mt-3 rounded-2xl bg-red-500/20 px-4 py-3 text-xs text-red-200">
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={onLogout}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-900 text-base font-semibold text-white"
            >
                Logout
            </button>
        </div>
    )
}
