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
type CardColor = 'blue' | 'orange' | 'red' | 'green'
type Section = 'manage' | 'new' | 'settings'
type AssignMode = 'child' | 'open' | 'collab'
type CollabMode = 'dateText' | 'weekdays' | 'weekdaysText'

interface ProposedChange {
    proposedById: string
    proposedByName?: string
    newDueDate?: Date | null
    status?: 'pending' | 'accepted' | 'rejected'
}

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
    inputType?: 'text' | 'text+date' | 'weekdays' | 'weekdays+text'
    proposedChange?: ProposedChange | null
}

interface FamilyMember {
    uid: string
    displayName: string
    role: 'parent' | 'child'
}

interface TaskSubmission {
    id: string
    taskId: string
    userId: string
    userName?: string | null
    note?: string | null
    date?: Date | null
    weekdays?: number[] | null
}

interface ParentDashboardProps {
    userId: string
    userName: string
    familyId: string
    inviteCode: string
    familyName: string
    members: FamilyMember[]
    onLogout: () => void
}

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

function getCardColorClasses(color: CardColor) {
    if (color === 'red') return 'bg-red-400 text-black'
    if (color === 'orange') return 'bg-amber-300 text-black'
    if (color === 'blue') return 'bg-sky-400 text-black'
    return 'bg-emerald-400 text-black'
}

function getDotColorClasses(color: CardColor) {
    if (color === 'red') return 'bg-red-400'
    if (color === 'orange') return 'bg-amber-300'
    if (color === 'blue') return 'bg-sky-400'
    return 'bg-emerald-400'
}

function formatDateTime(d?: Date | null) {
    if (!d) return 'Kein Datum'
    const date = d.toLocaleDateString()
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${date} • ${time}`
}

function weekdayLabel(n: number) {
    if (n === 1) return 'Mo'
    if (n === 2) return 'Di'
    if (n === 3) return 'Mi'
    if (n === 4) return 'Do'
    if (n === 5) return 'Fr'
    if (n === 6) return 'Sa'
    if (n === 7) return 'So'
    return ''
}

export default function ParentDashboard({
    userId,
    userName,
    familyId,
    inviteCode,
    familyName,
    members,
    onLogout
}: ParentDashboardProps) {
    const [tasks, setTasks] = useState<Task[]>([])
    const [submissions, setSubmissions] = useState<TaskSubmission[]>([])
    const [section, setSection] = useState<Section>('manage')
    const [error, setError] = useState<string | null>(null)

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [dueTime, setDueTime] = useState('')
    const [assignMode, setAssignMode] = useState<AssignMode>('child')
    const [assigneeId, setAssigneeId] = useState('')
    const [collabMode, setCollabMode] = useState<CollabMode>('dateText')
    const [creating, setCreating] = useState(false)

    const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'all'>(
        'open'
    )
    const [childFilter, setChildFilter] = useState<'all' | 'unassigned' | string>(
        'all'
    )
    const [processingTaskId, setProcessingTaskId] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [removingChildId, setRemovingChildId] = useState<string | null>(null)
    const [leavingFamily, setLeavingFamily] = useState(false)

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

                let proposed: ProposedChange | null = null
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
                return b.createdAt.getTime() - a.createdAt.getTime()
            })

            setTasks(list)
        })

        return () => unsub()
    }, [familyId])

    useEffect(() => {
        const submissionsRef = collection(db, 'taskSubmissions')
        const q = query(submissionsRef, where('familyId', '==', familyId))

        const unsub = onSnapshot(q, snapshot => {
            const list: TaskSubmission[] = snapshot.docs.map(docSnap => {
                const data = docSnap.data() as any
                const date =
                    data.date && data.date.toDate ? data.date.toDate() : null
                const weekdays =
                    data.weekdays && Array.isArray(data.weekdays)
                        ? (data.weekdays as number[])
                        : null
                return {
                    id: docSnap.id,
                    taskId: data.taskId,
                    userId: data.userId,
                    userName: data.userName ?? null,
                    note: data.note ?? null,
                    date,
                    weekdays
                }
            })
            setSubmissions(list)
        })

        return () => unsub()
    }, [familyId])

    const childrenMembers = useMemo(
        () => members.filter(m => m.role === 'child'),
        [members]
    )

    const filteredTasks = useMemo(
        () =>
            tasks.filter(t => {
                if (statusFilter === 'open' && t.status !== 'open') return false
                if (statusFilter === 'done' && t.status !== 'done') return false
                if (childFilter === 'all') return true
                if (childFilter === 'unassigned') {
                    return !t.assigneeId && t.isOpen
                }
                return t.assigneeId === childFilter
            }),
        [tasks, statusFilter, childFilter]
    )

    const overviewByChild = useMemo(() => {
        const map: Record<string, CardColor[]> = {}
        childrenMembers.forEach(child => {
            const childTasks = tasks.filter(
                t => t.assigneeId === child.uid && t.status === 'open'
            )
            map[child.uid] = childTasks.map(getCardColor)
        })
        return map
    }, [childrenMembers, tasks])

    const getSubmissionsForTask = (taskId: string) =>
        submissions.filter(s => s.taskId === taskId)

    const handleCreateTask = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!title.trim()) {
            setError('Bitte gib einen Titel ein.')
            return
        }
        if (assignMode === 'child' && !assigneeId) {
            setError('Bitte wähle ein Kind aus.')
            return
        }

        setError(null)
        setCreating(true)

        try {
            let due: Timestamp | null = null
            if (dueDate) {
                const time = dueTime || '00:00'
                const d = new Date(`${dueDate}T${time}:00`)
                if (!Number.isNaN(d.getTime())) {
                    due = Timestamp.fromDate(d)
                }
            }

            let isOpen = false
            let assignId: string | null = null
            let assignName: string | null = null
            let requiresInput = false
            let inputType: Task['inputType']

            if (assignMode === 'open') {
                isOpen = true
            } else if (assignMode === 'child') {
                assignId = assigneeId
                const member = childrenMembers.find(m => m.uid === assigneeId)
                assignName = member?.displayName || 'Kind'
            } else if (assignMode === 'collab') {
                isOpen = true
                requiresInput = true
                if (collabMode === 'dateText') inputType = 'text+date'
                if (collabMode === 'weekdays') inputType = 'weekdays'
                if (collabMode === 'weekdaysText') inputType = 'weekdays+text'
            }

            const tasksRef = collection(db, 'tasks')
            await addDoc(tasksRef, {
                familyId,
                title: title.trim(),
                description: description.trim() || null,
                status: 'open',
                isOpen,
                assigneeId: assignId,
                assigneeName: assignName,
                requiresInput,
                inputType: inputType || null,
                dueDate: due,
                createdAt: serverTimestamp(),
                proposedChange: null
            })

            setTitle('')
            setDescription('')
            setDueDate('')
            setDueTime('')
            setAssignMode('child')
            setAssigneeId('')
            setCollabMode('dateText')
            setSection('manage')
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Erstellen der Aufgabe'
            setError(message)
        } finally {
            setCreating(false)
        }
    }

    const handleAcceptProposal = async (task: Task) => {
        if (!task.proposedChange?.newDueDate) return
        setError(null)
        setProcessingTaskId(task.id)

        try {
            const ref = doc(db, 'tasks', task.id)
            await updateDoc(ref, {
                dueDate: Timestamp.fromDate(task.proposedChange.newDueDate),
                proposedChange: {
                    ...task.proposedChange,
                    status: 'accepted'
                }
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Annehmen'
            setError(message)
        } finally {
            setProcessingTaskId(null)
        }
    }

    const handleRejectProposal = async (task: Task) => {
        setError(null)
        setProcessingTaskId(task.id)

        try {
            const ref = doc(db, 'tasks', task.id)
            await updateDoc(ref, {
                proposedChange: {
                    ...task.proposedChange,
                    status: 'rejected'
                }
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Ablehnen'
            setError(message)
        } finally {
            setProcessingTaskId(null)
        }
    }

    const handleMarkDone = async (task: Task) => {
        setError(null)
        setProcessingTaskId(task.id)
        try {
            const ref = doc(db, 'tasks', task.id)
            await updateDoc(ref, {
                status: 'done'
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Aktualisieren'
            setError(message)
        } finally {
            setProcessingTaskId(null)
        }
    }

    const handleCopyInvite = async () => {
        setCopied(false)
        try {
            await navigator.clipboard.writeText(inviteCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            setError('Konnte Code nicht kopieren.')
        }
    }

    const handleRemoveChild = async (childId: string) => {
        setError(null)
        setRemovingChildId(childId)
        try {
            const ref = doc(db, 'users', childId)
            await updateDoc(ref, {
                familyId: null,
                role: null
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Entfernen des Kindes'
            setError(message)
        } finally {
            setRemovingChildId(null)
        }
    }

    const handleLeaveFamily = async () => {
        setError(null)
        setLeavingFamily(true)
        try {
            const ref = doc(db, 'users', userId)
            await updateDoc(ref, {
                familyId: null,
                role: null
            })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Fehler beim Verlassen der Familie'
            setError(message)
        } finally {
            setLeavingFamily(false)
        }
    }

    const renderSubmissionsSummary = (task: Task) => {
        const list = getSubmissionsForTask(task.id)
        if (!list.length) return null

        if (
            task.inputType === 'weekdays' ||
            task.inputType === 'weekdays+text'
        ) {
            const days = [1, 2, 3, 4, 5, 6, 7]
            return (
                <div className="mt-2 rounded-2xl bg-black/15 p-2 text-[11px]">
                    <div className="mb-1 font-semibold">
                        Wochenübersicht
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                        {days.map(day => {
                            const people = list.filter(
                                s => s.weekdays && s.weekdays.includes(day)
                            )
                            const count = people.length
                            const names = people
                                .map(p => p.userName || 'Familie')
                                .join(', ')
                            const hasPeople = count > 0
                            return (
                                <div
                                    key={day}
                                    className={`rounded-xl px-2 py-1 ${hasPeople
                                        ? 'bg-zinc-900 text-zinc-50'
                                        : 'bg-zinc-200 text-zinc-500'
                                        }`}
                                >
                                    <div className="text-[11px] font-semibold">
                                        {weekdayLabel(day)} ({count})
                                    </div>
                                    {hasPeople && (
                                        <div className="mt-0.5 text-[10px] leading-snug">
                                            {names}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )
        }

        // text(+date)-Tasks -> Liste pro Person
        return (
            <div className="mt-2 rounded-2xl bg-black/15 p-2 text-[11px]">
                <div className="mb-1 font-semibold">
                    Einträge
                </div>
                <div className="space-y-1">
                    {list.map(s => (
                        <div
                            key={s.id}
                            className="rounded-xl bg-black/10 px-2 py-1"
                        >
                            <div className="font-semibold">
                                {s.userName || 'Familienmitglied'}
                            </div>
                            {s.date && (
                                <div className="text-[10px]">
                                    {s.date.toLocaleDateString()}
                                </div>
                            )}
                            {s.note && (
                                <div className="text-[10px] text-zinc-100">
                                    {s.note}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const renderManageSection = () => (
        <div className="mt-4 rounded-3xl bg-zinc-900/40 p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-semibold">Tasks</span>
                <div className="flex flex-wrap gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('open')}
                        className={`flex h-9 items-center rounded-full px-3 ${statusFilter === 'open'
                            ? 'bg-white text-zinc-900'
                            : 'bg-zinc-700 text-zinc-100'
                            }`}
                    >
                        Offen
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('done')}
                        className={`flex h-9 items-center rounded-full px-3 ${statusFilter === 'done'
                            ? 'bg-white text-zinc-900'
                            : 'bg-zinc-700 text-zinc-100'
                            }`}
                    >
                        Erledigt
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`flex h-9 items-center rounded-full px-3 ${statusFilter === 'all'
                            ? 'bg-white text-zinc-900'
                            : 'bg-zinc-700 text-zinc-100'
                            }`}
                    >
                        Alle
                    </button>
                </div>
            </div>

            <div className="mb-3">
                <div className="mb-1 text-xs font-medium text-zinc-200">
                    Filter Kind
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() => setChildFilter('all')}
                        className={`flex h-9 items-center rounded-full px-3 ${childFilter === 'all'
                            ? 'bg-white text-zinc-900'
                            : 'bg-zinc-700 text-zinc-100'
                            }`}
                    >
                        Alle
                    </button>
                    <button
                        type="button"
                        onClick={() => setChildFilter('unassigned')}
                        className={`flex h-9 items-center rounded-full px-3 ${childFilter === 'unassigned'
                            ? 'bg-white text-zinc-900'
                            : 'bg-zinc-700 text-zinc-100'
                            }`}
                    >
                        Offen
                    </button>
                    {childrenMembers.map(child => (
                        <button
                            key={child.uid}
                            type="button"
                            onClick={() => setChildFilter(child.uid)}
                            className={`flex h-9 items-center rounded-full px-3 ${childFilter === child.uid
                                ? 'bg-white text-zinc-900'
                                : 'bg-zinc-700 text-zinc-100'
                                }`}
                        >
                            {child.displayName}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-h-60 overflow-y-auto pr-1">
                {filteredTasks.length === 0 && (
                    <div className="py-3 text-center text-sm text-zinc-400">
                        Keine Aufgaben in diesem Filter.
                    </div>
                )}

                {filteredTasks.map(task => {
                    const color = getCardColor(task)
                    const cls = getCardColorClasses(color)
                    const proposedPending =
                        task.proposedChange && task.proposedChange.status === 'pending'
                    const isProcessing = processingTaskId === task.id

                    return (
                        <div
                            key={task.id}
                            className={`mb-3 rounded-3xl px-4 py-3 text-sm shadow-md ${cls}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <div className="text-base font-semibold">
                                        {task.title}
                                    </div>
                                    {task.description && (
                                        <div className="mt-0.5 text-xs opacity-80">
                                            {task.description}
                                        </div>
                                    )}
                                    <div className="mt-1 text-xs">
                                        {formatDateTime(task.dueDate)}
                                    </div>
                                    <div className="mt-1 text-xs">
                                        {task.isOpen && !task.assigneeId && 'Alle'}
                                        {!task.isOpen && task.assigneeName && (
                                            <>Zugewiesen an {task.assigneeName}</>
                                        )}
                                        {task.requiresInput && (
                                            <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px]">
                                                Eingabe nötig
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {task.status === 'open' && (
                                        <button
                                            type="button"
                                            disabled={isProcessing}
                                            onClick={() => handleMarkDone(task)}
                                            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-lg disabled:opacity-60"
                                            title="Als erledigt markieren"
                                        >
                                            ✔
                                        </button>
                                    )}
                                </div>
                            </div>

                            {proposedPending && task.proposedChange?.newDueDate && (
                                <div className="mt-3 rounded-2xl bg-black/15 p-3 text-xs">
                                    <div className="mb-1 font-semibold">
                                        Vorschlag von{' '}
                                        {task.proposedChange.proposedByName || 'Kind'}:
                                    </div>
                                    <div className="mb-2">
                                        {formatDateTime(task.proposedChange.newDueDate)}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={isProcessing}
                                            onClick={() => handleAcceptProposal(task)}
                                            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-zinc-900 text-xs font-semibold text-white disabled:opacity-60"
                                        >
                                            Annehmen
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isProcessing}
                                            onClick={() => handleRejectProposal(task)}
                                            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-white/80 text-xs font-semibold text-zinc-900 disabled:opacity-60"
                                        >
                                            Ablehnen
                                        </button>
                                    </div>
                                </div>
                            )}

                            {task.requiresInput && renderSubmissionsSummary(task)}
                        </div>
                    )
                })}
            </div>
        </div>
    )

    const renderNewTaskSection = () => (
        <div className="mt-4 rounded-3xl bg-zinc-900/40 p-4 text-sm">
            <div className="mb-3 text-base font-semibold">
                Neuer Task
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3">
                <div>
                    <div className="mb-1 text-xs font-medium text-zinc-200">
                        Titel
                    </div>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="z.B. Zimmer putzen oder Kochplan"
                        required
                    />
                </div>

                <div>
                    <div className="mb-1 text-xs font-medium text-zinc-200">
                        Beschreibung (optional)
                    </div>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="h-20 w-full resize-none rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="Details zur Aufgabe"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="mb-1 text-xs font-medium text-zinc-200">
                            Datum
                        </div>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        />
                    </div>
                    <div>
                        <div className="mb-1 text-xs font-medium text-zinc-200">
                            Zeit
                        </div>
                        <input
                            type="time"
                            value={dueTime}
                            onChange={e => setDueTime(e.target.value)}
                            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        />
                    </div>
                </div>

                <div>
                    <div className="mb-1 text-xs font-medium text-zinc-200">
                        Zuweisung
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setAssignMode('child')}
                            className={`flex h-9 items-center rounded-full px-3 ${assignMode === 'child'
                                ? 'bg-white text-zinc-900'
                                : 'bg-zinc-700 text-zinc-100'
                                }`}
                        >
                            Kind
                        </button>
                        <button
                            type="button"
                            onClick={() => setAssignMode('open')}
                            className={`flex h-9 items-center rounded-full px-3 ${assignMode === 'open'
                                ? 'bg-white text-zinc-900'
                                : 'bg-zinc-700 text-zinc-100'
                                }`}
                        >
                            Alle
                        </button>
                        <button
                            type="button"
                            onClick={() => setAssignMode('collab')}
                            className={`flex h-9 items-center rounded-full px-3 ${assignMode === 'collab'
                                ? 'bg-white text-zinc-900'
                                : 'bg-zinc-700 text-zinc-100'
                                }`}
                        >
                            Kollaborativ (z.B. Kochplan)
                        </button>
                    </div>

                    {assignMode === 'child' && (
                        <select
                            value={assigneeId}
                            onChange={e => setAssigneeId(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        >
                            <option value="">Kind auswählen</option>
                            {childrenMembers.map(child => (
                                <option key={child.uid} value={child.uid}>
                                    {child.displayName}
                                </option>
                            ))}
                        </select>
                    )}

                    {assignMode === 'collab' && (
                        <div className="mt-2 space-y-2 rounded-xl bg-zinc-900 px-3 py-3 text-xs">
                            <div className="font-medium">
                                Wie sollen Kinder eintragen?
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={collabMode === 'dateText'}
                                        onChange={() => setCollabMode('dateText')}
                                    />
                                    <span>Datum + Text (z.B. &quot;Montag – Spaghetti&quot;)</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={collabMode === 'weekdays'}
                                        onChange={() => setCollabMode('weekdays')}
                                    />
                                    <span>Wochentage (Mo–So) auswählen</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={collabMode === 'weekdaysText'}
                                        onChange={() => setCollabMode('weekdaysText')}
                                    />
                                    <span>Wochentage + Text (z.B. wer an welchem Tag kocht)</span>
                                </label>
                            </div>
                            <div className="text-[11px] text-zinc-300">
                                Für Dinge wie Kochplan oder „wer nimmt Essen mit“ ist
                                &quot;Wochentage&quot; oder &quot;Wochentage + Text&quot;
                                ideal. Kinder wählen einmal ihre Tage – der Plan gilt dann
                                jede Woche, bis ihr ihn anpasst.
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="text-xs text-red-400">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={creating}
                    className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl bg-white text-base font-semibold text-zinc-900 disabled:opacity-60"
                >
                    {creating ? 'Erstelle...' : 'Task erstellen'}
                </button>
            </form>
        </div>
    )

    const renderOverview = () => (
        <div className="mt-4 rounded-3xl bg-zinc-900/40 p-4 text-sm">
            <div className="mb-2 text-base font-semibold">
                Overview
            </div>
            {childrenMembers.length === 0 && (
                <div className="text-sm text-zinc-400">
                    Noch keine Kinder in dieser Familie.
                </div>
            )}
            {childrenMembers.map(child => {
                const dots = overviewByChild[child.uid] || []
                return (
                    <div
                        key={child.uid}
                        className="flex items-center justify-between py-1"
                    >
                        <div className="text-sm">
                            {child.displayName}
                        </div>
                        <div className="flex max-w-[140px] flex-wrap gap-1">
                            {dots.length === 0 && (
                                <span className="text-[11px] text-zinc-400">
                                    keine offenen Tasks
                                </span>
                            )}
                            {dots.map((color, idx) => (
                                <span
                                    key={`${child.uid}-${idx}`}
                                    className={`h-3.5 w-3.5 rounded-full ${getDotColorClasses(
                                        color
                                    )}`}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )

    const renderSettings = () => (
        <div className="mt-4 rounded-3xl bg-zinc-900/40 p-4 text-sm">
            <div className="mb-3 text-base font-semibold">
                Einstellungen
            </div>

            <div className="mb-4">
                <div className="text-xs font-medium text-zinc-300">
                    Familie
                </div>
                <div className="text-sm text-zinc-100">
                    {familyName}
                </div>
            </div>

            <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-zinc-300">
                    Einladungs-Code
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-xl bg-zinc-900 px-3 py-3 font-mono text-sm">
                        {inviteCode || '—'}
                    </div>
                    <button
                        type="button"
                        onClick={handleCopyInvite}
                        className="flex h-11 items-center rounded-xl bg-white px-3 text-xs font-semibold text-zinc-900"
                    >
                        {copied ? 'Kopiert' : 'Copy'}
                    </button>
                </div>
            </div>

            <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-zinc-300">
                    Kinder verwalten
                </div>
                {childrenMembers.length === 0 && (
                    <div className="text-xs text-zinc-400">
                        Noch keine Kinder in dieser Familie.
                    </div>
                )}
                <div className="space-y-2">
                    {childrenMembers.map(child => (
                        <div
                            key={child.uid}
                            className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2"
                        >
                            <div className="text-sm">
                                {child.displayName}
                            </div>
                            <button
                                type="button"
                                disabled={removingChildId === child.uid}
                                onClick={() => handleRemoveChild(child.uid)}
                                className="flex h-9 items-center rounded-xl bg-red-500 px-3 text-xs font-semibold text-white disabled:opacity-60"
                            >
                                Entfernen
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={onLogout}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-900 text-base font-semibold text-white"
            >
                Logout
            </button>

            <button
                type="button"
                onClick={handleLeaveFamily}
                disabled={leavingFamily}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white disabled:opacity-60"
            >
                Familie verlassen
            </button>

            {error && (
                <div className="mt-3 rounded-2xl bg-red-500/20 px-4 py-3 text-xs text-red-200">
                    {error}
                </div>
            )}
        </div>
    )

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

            {renderOverview()}

            <div className="mt-4 flex flex-col gap-3">
                <button
                    type="button"
                    onClick={() => setSection('manage')}
                    className={`flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold ${section === 'manage'
                        ? 'bg-sky-400 text-black'
                        : 'bg-sky-300 text-black/80'
                        }`}
                >
                    Manage Tasks
                </button>
                <button
                    type="button"
                    onClick={() => setSection('new')}
                    className={`flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold ${section === 'new'
                        ? 'bg-emerald-400 text-black'
                        : 'bg-emerald-300 text-black/80'
                        }`}
                >
                    Neuer Task
                </button>
            </div>

            {section === 'manage' && renderManageSection()}
            {section === 'new' && renderNewTaskSection()}

            <button
                type="button"
                onClick={() =>
                    setSection(prev => (prev === 'settings' ? 'manage' : 'settings'))
                }
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-300 text-base font-semibold text-zinc-900"
            >
                {section === 'settings' ? 'Zurück' : 'Einstellungen'}
            </button>

            {section === 'settings' && renderSettings()}
        </div>
    )
}
