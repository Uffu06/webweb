import { useEffect, useState } from 'react'
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
type TaskFilter = 'all' | 'mine' | 'open' | 'done'
type AssignMode = 'open' | 'me' | 'user'

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
}

interface FamilyMember {
  uid: string
  displayName: string
  role: 'parent' | 'child'
}

interface TaskDashboardProps {
  familyId: string
  userId: string
  userName: string
  userRole: 'parent' | 'child'
  members: FamilyMember[]
}

export default function TaskDashboard({
  familyId,
  userId,
  userName,
  userRole,
  members
}: TaskDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDateInput, setDueDateInput] = useState('')
  const [assignMode, setAssignMode] = useState<AssignMode>('me')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('all')

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
          createdAt: created
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

  const handleCreateTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Bitte gib einen Titel ein.')
      return
    }
    if (assignMode === 'user' && userRole === 'parent' && !selectedUserId) {
      setError('Bitte wähle eine Person für diese Aufgabe.')
      return
    }

    setError(null)
    setCreating(true)

    try {
      let dueTimestamp: Timestamp | null = null
      if (dueDateInput) {
        const date = new Date(dueDateInput + 'T00:00:00')
        if (!Number.isNaN(date.getTime())) {
          dueTimestamp = Timestamp.fromDate(date)
        }
      }

      let isOpen = false
      let assigneeId: string | null = null
      let assigneeName: string | null = null

      if (assignMode === 'open') {
        isOpen = true
      } else if (assignMode === 'me') {
        assigneeId = userId
        assigneeName = userName
      } else if (assignMode === 'user' && userRole === 'parent') {
        assigneeId = selectedUserId
        const member = members.find(m => m.uid === selectedUserId)
        assigneeName = member?.displayName || 'Unbekannt'
      }

      const tasksRef = collection(db, 'tasks')
      await addDoc(tasksRef, {
        familyId,
        title: title.trim(),
        description: description.trim() || null,
        status: 'open',
        isOpen,
        assigneeId,
        assigneeName,
        dueDate: dueTimestamp,
        createdAt: serverTimestamp()
      })

      setTitle('')
      setDescription('')
      setDueDateInput('')
      setAssignMode('me')
      setSelectedUserId('')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Erstellen der Aufgabe'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  const handleTakeTask = async (task: Task) => {
    try {
      const ref = doc(db, 'tasks', task.id)
      await updateDoc(ref, {
        isOpen: false,
        assigneeId: userId,
        assigneeName: userName
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Übernehmen der Aufgabe'
      setError(message)
    }
  }

  const handleMarkDone = async (task: Task) => {
    try {
      const ref = doc(db, 'tasks', task.id)
      await updateDoc(ref, {
        status: 'done'
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fehler beim Aktualisieren der Aufgabe'
      setError(message)
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'mine') {
      return task.assigneeId === userId
    }
    if (filter === 'open') {
      return task.status === 'open' && task.isOpen
    }
    if (filter === 'done') {
      return task.status === 'done'
    }
    return true
  })

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl bg-white p-4 shadow-md">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Neue Aufgabe
        </h2>
        <form onSubmit={handleCreateTask} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Titel
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              placeholder="z.B. Küche aufräumen"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="h-20 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              placeholder="Optional, z.B. was genau gemacht werden soll"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Fälligkeitsdatum
              </label>
              <input
                type="date"
                value={dueDateInput}
                onChange={e => setDueDateInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Zuweisung
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAssignMode('me')}
                  className={`rounded-md px-3 py-2 text-xs font-medium ${
                    assignMode === 'me'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Mir zuweisen
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('open')}
                  className={`rounded-md px-3 py-2 text-xs font-medium ${
                    assignMode === 'open'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Offene Aufgabe
                </button>
                {userRole === 'parent' && (
                  <button
                    type="button"
                    onClick={() => setAssignMode('user')}
                    className={`rounded-md px-3 py-2 text-xs font-medium ${
                      assignMode === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Person wählen
                  </button>
                )}
              </div>
              {assignMode === 'user' && userRole === 'parent' && (
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                >
                  <option value="">Person auswählen</option>
                  {members.map(member => (
                    <option key={member.uid} value={member.uid}>
                      {member.displayName || 'Unbenannt'}{' '}
                      {member.role === 'parent' ? '(Elternteil)' : '(Kind)'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creating ? 'Erstelle Aufgabe' : 'Aufgabe erstellen'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-md">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Aufgaben
          </h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Alle
            </button>
            <button
              type="button"
              onClick={() => setFilter('mine')}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === 'mine'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Meine
            </button>
            <button
              type="button"
              onClick={() => setFilter('open')}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === 'open'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Offene
            </button>
            <button
              type="button"
              onClick={() => setFilter('done')}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === 'done'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Erledigt
            </button>
          </div>
        </div>

        {filteredTasks.length === 0 && (
          <p className="text-sm text-slate-500">
            Noch keine Aufgaben vorhanden.
          </p>
        )}

        <div className="space-y-3">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className="rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {task.title}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    task.status === 'done'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {task.status === 'done' ? 'Erledigt' : 'Offen'}
                </span>
              </div>

              {task.description && (
                <p className="mb-1 text-xs text-slate-700">
                  {task.description}
                </p>
              )}

              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>
                  Fällig:{' '}
                  {task.dueDate
                    ? task.dueDate.toLocaleDateString()
                    : 'Kein Datum'}
                </span>
                <span className="text-slate-400">•</span>
                <span>
                  Zuständig:{' '}
                  {task.isOpen
                    ? 'Noch offen'
                    : task.assigneeName || 'Unbekannt'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {task.status === 'open' && task.isOpen && (
                  <button
                    type="button"
                    onClick={() => handleTakeTask(task)}
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Übernehmen
                  </button>
                )}

                {task.status === 'open' && task.assigneeId === userId && (
                  <button
                    type="button"
                    onClick={() => handleMarkDone(task)}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Als erledigt markieren
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
