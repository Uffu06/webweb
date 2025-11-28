export type UserRole = 'parent' | 'child'

export interface Family {
  id: string
  name: string
  inviteCode: string
  createdAt: Date
}

export interface AppUser {
  uid: string
  familyId: string
  displayName: string
  email: string
  role: UserRole
  photoURL?: string
  createdAt: Date
}

export type TaskType = 'single' | 'recurring' | 'submission'
export type TaskStatus = 'open' | 'in_progress' | 'done'

export interface RecurrenceConfig {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[]
  dayOfMonth?: number
  endDate?: Date | null
}

export interface ProposedChange {
  proposedById: string
  newDueDate: Date
  status: 'pending' | 'accepted' | 'rejected'
}

export interface Task {
  id: string
  familyId: string
  title: string
  description?: string
  type: TaskType
  status: TaskStatus
  isOpen: boolean
  assigneeId?: string | null
  dueDate?: Date
  recurrence?: RecurrenceConfig
  parentTaskId?: string | null
  proposedChange?: ProposedChange | null
  createdAt: Date
  updatedAt: Date
}

export interface TaskSubmission {
  id: string
  familyId: string
  taskId: string
  userId: string
  date: Date
  title?: string
  notes?: string
  createdAt: Date
}
