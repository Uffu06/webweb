import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { db } from './firebase'
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  addDoc
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
  onLogout: () => void
}

type CardColor = 'blue' | 'orange' | 'red' | 'green'

function getCardColor(task: Task): CardColor {
  if (task.status === 'done') return 'green'
  if (!task.dueDate) return 'blue'
  const now = new Date().getTime()
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
          inputType: data.inputType ?? undefined
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
      existing?.date
        ? existing.date.toISOString().slice(0, 10)
        : ''
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
        className={`mb-3 rounded-2xl px-3 py-2 shadow-md ${colorClasses}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide">
              {task.title}
            </div>
            {task.dueDate && (
              <div className="text-[10px] leading-tight">
                {task.dueDate.toLocaleDateString()}
                <br />
                {task.dueDate.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-lg">
            {task.status === 'open' && (
              <button
                type="button"
                onClick={() => handleOpenProposal(task.id)}
                className="leading-none"
                title="Anderes Datum vorschlagen"
              >
                🙏
              </button>
            )}
            {canShowDoneButton && (
              <button
                type="button"
                onClick={() => handleMarkDone(task)}
                className="leading-none"
                title="Aufgabe erledigt"
              >
                👍
              </button>
            )}
            {task.status === 'done' && isDoneSection && (
              <span className="text-base" title="Erledigt">
                👍
              </span>
            )}
          </div>
        </div>

        {proposalTaskId === task.id && task.status === 'open' && (
          <form
            onSubmit={e => handleSendProposal(task, e)}
            className="mt-2 rounded-md bg-white/70 p-2 text-[10px]"
          >
            <div className="mb-1 font-semibold text-zinc-800">
              Neues Datum vorschlagen
            </div>
            <input
              type="date"
              value={proposalDate}
              onChange={e => setProposalDate(e.target.value)}
              className="mb-1 w-full rounded-md border border-zinc-400 px-2 py-1 text-[10px] text-zinc-900 outline-none"
              required
            />
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white"
            >
              Vorschlagen
            </button>
          </form>
        )}

        {task.requiresInput && task.inputType && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => handleToggleExpand(task.id)}
              className="w-full rounded-md bg-black/15 px-2 py-1 text-[10px] font-semibold"
            >
              {expandedTaskId === task.id
                ? 'Eingaben ausblenden'
                : 'Details eingeben'}
            </button>

            {showInputArea && (
              <form
                onSubmit={e => handleSaveInput(task, e)}
                className="mt-2 rounded-md bg-white/80 p-2 text-[10px] text-zinc-900"
              >
                {task.inputType === 'text' ||
                task.inputType === 'text+date' ? (
                  <div className="mb-2">
                    <div className="mb-1 font-semibold">
                      Beschreibung / Gericht
                    </div>
                    <input
                      type="text"
                      value={inputNote}
                      onChange={e => setInputNote(e.target.value)}
                      className="w-full rounded-md border border-zinc-400 px-2 py-1 text-[10px] outline-none"
                      placeholder="z.B. Hörnli mit Hackfleisch"
                    />
                  </div>
                ) : null}

                {task.inputType === 'text+date' && (
                  <div className="mb-2">
                    <div className="mb-1 font-semibold">Datum wählen</div>
                    <input
                      type="date"
                      value={inputDate}
                      onChange={e => setInputDate(e.target.value)}
                      className="w-full rounded-md border border-zinc-400 px-2 py-1 text-[10px] outline-none"
                    />
                  </div>
                )}

                {mySubmission && (
                  <div className="mb-2 rounded-md bg-zinc-100 p-2 text-[10px]">
                    <div className="font-semibold text-zinc-800">
                      Deine aktuelle Eingabe:
                    </div>
                    {mySubmission.note && (
                      <div className="text-zinc-700">
                        {mySubmission.note}
                      </div>
                    )}
                    {mySubmission.date && (
                      <div className="text-zinc-700">
                        {mySubmission.date.toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingInputTaskId === task.id}
                  className="w-full rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-60"
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
    <div className="rounded-[32px] bg-zinc-800 px-4 py-5 text-white shadow-2xl">
      <div className="mb-4 text-center">
        <div className="text-sm font-bold tracking-[0.2em]">
          WEBWEB
        </div>
        <div className="mt-1 text-lg font-semibold">
          Hello Kind
        </div>
        <div className="text-[11px] text-zinc-300">
          {userName}
        </div>
      </div>

      <div className="mb-4 border-t border-zinc-700" />

      <div className="max-h-[60vh] overflow-y-auto pb-2">
        {loading && (
          <div className="py-4 text-center text-xs text-zinc-300">
            Lade deine Aufgaben...
          </div>
        )}

        {!loading && openTasks.length === 0 && doneTasks.length === 0 && (
          <div className="py-4 text-center text-xs text-zinc-300">
            Du hast gerade keine Aufgaben 🎉
          </div>
        )}

        {openTasks.map(task => renderTaskCard(task, false))}

        {openTasks.length > 0 && doneTasks.length > 0 && (
          <div className="my-2 border-t border-zinc-700" />
        )}

        {doneTasks.map(task => renderTaskCard(task, true))}
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-[10px] text-red-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onLogout}
        className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white"
      >
        Logout
      </button>
    </div>
  )
}
