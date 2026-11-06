import type { WorkOrderState } from '@/domain/model/workOrder'

export type Tone = 'danger' | 'caution' | 'orange' | 'info' | 'success' | 'neutral' | 'accent'

export const STATE_TONE: Record<WorkOrderState, Tone> = {
  DRAFT: 'neutral',
  ASSIGNED: 'info',
  IN_PROGRESS: 'caution',
  DONE: 'success',
  CANCELLED: 'danger',
}

export function priorityTone(priority: string): Tone {
  switch (priority.trim().toUpperCase()) {
    case 'MUY ALTA':
      return 'danger'
    case 'ALTA':
      return 'orange'
    case 'MEDIA':
      return 'caution'
    case 'BAJA':
      return 'info'
    default:
      return 'neutral'
  }
}
