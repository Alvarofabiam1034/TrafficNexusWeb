/** Estados de una OT según el API. */
export const WORK_ORDER_STATES = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number]

export function isWorkOrderState(value: unknown): value is WorkOrderState {
  return typeof value === 'string' && (WORK_ORDER_STATES as readonly string[]).includes(value)
}

/** Fila de la tabla del mensaje WhatsApp (ID de equipo / semáforo). */
export interface WorkOrderItem {
  readonly id: string
  /** ID de la tabla WhatsApp, ej. "1046". */
  readonly externalId: string
  readonly priority: string
  readonly address: string
  readonly equipment: string
  readonly maintenance: string
  readonly position: number
}

/** Snapshot del punto del mapa anclado a la OT (coords/doc del mapa vigente al crear/reanclar). */
export interface WorkOrderPlace {
  readonly id: string
  readonly name: string
  readonly latitude: number
  readonly longitude: number
  readonly documentation: string
}

/**
 * Orden de trabajo: incidente sobre un externo del mapa, con ítems y asignación a cuadrilla.
 */
export interface WorkOrder {
  readonly id: string
  readonly externalNumber: string
  readonly statusReported: string
  readonly rawMessage: string
  readonly parsedNotes: string
  readonly adminNotes: string
  readonly state: WorkOrderState
  readonly crewId: string | null
  readonly assignedAt: string | null
  readonly assignedBy: string | null
  readonly assignedByName: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string | null
  readonly createdByName: string
  /** Null en OTs antiguas creadas antes del anclaje al mapa. */
  readonly place: WorkOrderPlace | null
  readonly items: readonly WorkOrderItem[]
}

/** Preview de parse (sin persistir). */
export interface ParsedWorkOrderDraft {
  readonly externalNumber: string
  readonly statusReported: string
  readonly parsedNotes: string
  readonly items: readonly WorkOrderItem[]
}

/** Ítem en create/update (sin id de servidor). */
export interface WorkOrderItemInput {
  readonly externalId: string
  readonly priority: string
  readonly address: string
  readonly equipment: string
  readonly maintenance: string
}

export interface WorkOrderCreateDraft {
  /** Place del mapa vigente; obligatorio en el API. */
  readonly placeId: string
  readonly rawMessage: string
  readonly adminNotes?: string
  readonly externalNumber?: string
  readonly statusReported?: string
  readonly parsedNotes?: string
  readonly items?: readonly WorkOrderItemInput[]
}

export interface WorkOrderUpdateDraft {
  readonly externalNumber: string
  readonly statusReported: string
  readonly parsedNotes: string
  readonly adminNotes: string
  readonly items: readonly WorkOrderItemInput[]
  /** Si se envía, revalida el mapa vigente y refresca el snapshot de place. */
  readonly placeId?: string
}

const PRIORITY_RANK: Record<string, number> = {
  'MUY ALTA': 4,
  ALTA: 3,
  MEDIA: 2,
  BAJA: 1,
}

/** Prioridad más alta entre los ítems (para chips de lista). */
export function maxPriority(items: readonly WorkOrderItem[]): string {
  let best = ''
  let rank = -1
  for (const item of items) {
    const key = item.priority.trim().toUpperCase()
    const value = PRIORITY_RANK[key] ?? 0
    if (value > rank) {
      rank = value
      best = item.priority.trim()
    }
  }
  return best
}

/** Intenta sacar el número de externo del nombre de un place del mapa. */
export function externalNumberFromPlaceName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const nei = trimmed.match(/\bNEI[- ]?(\d{2,6})\b/i)
  if (nei?.[1]) return nei[1]
  const externo = trimmed.match(/\bexterno\s+(\d{2,6})\b/i)
  if (externo?.[1]) return externo[1]
  if (/^\d{2,6}$/.test(trimmed)) return trimmed
  const any = trimmed.match(/\b(\d{2,6})\b/)
  return any?.[1] ?? null
}
