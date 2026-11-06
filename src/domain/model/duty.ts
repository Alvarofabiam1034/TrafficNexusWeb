/** Estados de una jornada según el API. */
export const DUTY_STATES = ['OPEN', 'CLOSED', 'CLOSED_BY_HANDOVER', 'CLOSED_BY_ADMIN'] as const
export type DutyState = (typeof DUTY_STATES)[number]

export function isDutyState(value: unknown): value is DutyState {
  return typeof value === 'string' && (DUTY_STATES as readonly string[]).includes(value)
}

const DUTY_STATE_LABELS: Record<DutyState, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  CLOSED_BY_HANDOVER: 'Cerrada por traspaso',
  CLOSED_BY_ADMIN: 'Cerrada por admin',
}

export function dutyStateLabel(state: DutyState): string {
  return DUTY_STATE_LABELS[state]
}

export const CHECKLIST_MARKS = ['PENDING', 'OK', 'MISSING'] as const
export type ChecklistMark = (typeof CHECKLIST_MARKS)[number]

export function isChecklistMark(value: unknown): value is ChecklistMark {
  return typeof value === 'string' && (CHECKLIST_MARKS as readonly string[]).includes(value)
}

export type ChecklistStatus = 'IN_PROGRESS' | 'COMPLETED'

export interface Duty {
  readonly id: string
  readonly crewId: string
  readonly vehicleId: string
  readonly plate: string
  readonly state: DutyState
  readonly openedAt: string
  readonly closedAt: string | null
  readonly openedByName: string
  readonly closedByName: string
  readonly closeReason: string
  /** La jornada empezó recibiendo el carro de otra cuadrilla que no cerró. */
  readonly handoverFromDutyId: string | null
  readonly regularizedFromDutyId: string | null
}

/** Jornada con el resultado de herramienta de sus checklists. */
export interface DutyHistoryEntry extends Duty {
  /** Null si la jornada no tiene ese checklist. */
  readonly openChecklistStatus: ChecklistStatus | null
  readonly closeChecklistStatus: ChecklistStatus | null
  readonly missingAtOpen: number
  readonly missingAtClose: number
  /** Herramientas que vuelven faltando sin haber salido faltando. */
  readonly lostInDuty: number
}

export interface DutyChecklistLine {
  readonly id: string
  readonly itemId: string
  readonly itemName: string
  readonly groupName: string
  readonly brand: string
  readonly serial: string
  readonly mark: ChecklistMark
  /** Detalle opcional del hallazgo cuando mark = MISSING. */
  readonly comment: string
  readonly markedByName: string
  /** Marca en la apertura; solo en líneas de cierre. Null si no estaba al abrir. */
  readonly openMark: ChecklistMark | null
}

export interface DutyChecklist {
  readonly id: string
  readonly status: ChecklistStatus
  readonly completedAt: string | null
  readonly completedByName: string
  readonly lines: readonly DutyChecklistLine[]
}

export interface DutyDetail {
  readonly duty: Duty
  readonly openChecklist: DutyChecklist | null
  readonly closeChecklist: DutyChecklist | null
}

export interface DutyHistoryFilter {
  readonly crewId?: string
  /** YYYY-MM-DD, día de apertura en Bogotá (inclusive). */
  readonly from?: string
  readonly to?: string
}

export function isLostInDuty(line: DutyChecklistLine): boolean {
  return line.mark === 'MISSING' && line.openMark !== 'MISSING'
}

/** Novedades a revisar: pérdidas en la jornada, o faltantes al recibir el carro por traspaso. */
export function hasToolFindings(entry: DutyHistoryEntry): boolean {
  return entry.lostInDuty > 0 || entry.missingAtOpen > 0
}

/**
 * Resultado de una herramienta comparando apertura y cierre.
 * LOST: salió bien (o no estaba al abrir) y vuelve faltando.
 * STILL_MISSING: faltaba al abrir y sigue faltando.
 * MISSING_AT_OPEN: faltaba al abrir y no hay cierre revisado.
 * RECOVERED: faltaba al abrir y vuelve.
 * NOT_REVIEWED: sin revisión de cierre.
 */
export type ToolOutcome = 'LOST' | 'STILL_MISSING' | 'MISSING_AT_OPEN' | 'RECOVERED' | 'NOT_REVIEWED' | 'OK'

const OUTCOME_ORDER: Record<ToolOutcome, number> = {
  LOST: 0,
  STILL_MISSING: 1,
  MISSING_AT_OPEN: 2,
  RECOVERED: 3,
  NOT_REVIEWED: 4,
  OK: 5,
}

export interface ToolReviewRow {
  readonly itemId: string
  readonly itemName: string
  readonly groupName: string
  readonly brand: string
  readonly serial: string
  readonly openMark: ChecklistMark | null
  readonly openComment: string
  readonly closeMark: ChecklistMark | null
  readonly closeComment: string
  readonly outcome: ToolOutcome
}

function outcomeOf(openMark: ChecklistMark | null, closeMark: ChecklistMark | null): ToolOutcome {
  if (closeMark === 'MISSING') return openMark === 'MISSING' ? 'STILL_MISSING' : 'LOST'
  if (closeMark === 'OK') return openMark === 'MISSING' ? 'RECOVERED' : 'OK'
  return openMark === 'MISSING' ? 'MISSING_AT_OPEN' : 'NOT_REVIEWED'
}

function commentIfMissing(mark: ChecklistMark | null | undefined, comment: string | undefined): string {
  return mark === 'MISSING' ? (comment ?? '').trim() : ''
}

/** Una fila por herramienta (apertura ∪ cierre), novedades primero. */
export function toolReviewRows(detail: DutyDetail): ToolReviewRow[] {
  const rows: ToolReviewRow[] = []
  const seen = new Set<string>()
  const openByItem = new Map((detail.openChecklist?.lines ?? []).map((line) => [line.itemId, line]))
  for (const line of detail.closeChecklist?.lines ?? []) {
    seen.add(line.itemId)
    const openLine = openByItem.get(line.itemId)
    const openMark = line.openMark ?? openLine?.mark ?? null
    rows.push({
      itemId: line.itemId,
      itemName: line.itemName,
      groupName: line.groupName,
      brand: line.brand,
      serial: line.serial,
      openMark,
      openComment: commentIfMissing(openMark, openLine?.comment),
      closeMark: line.mark,
      closeComment: commentIfMissing(line.mark, line.comment),
      outcome: outcomeOf(openMark, line.mark),
    })
  }
  for (const line of detail.openChecklist?.lines ?? []) {
    if (seen.has(line.itemId)) continue
    rows.push({
      itemId: line.itemId,
      itemName: line.itemName,
      groupName: line.groupName,
      brand: line.brand,
      serial: line.serial,
      openMark: line.mark,
      openComment: commentIfMissing(line.mark, line.comment),
      closeMark: null,
      closeComment: '',
      outcome: outcomeOf(line.mark, null),
    })
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => OUTCOME_ORDER[a.row.outcome] - OUTCOME_ORDER[b.row.outcome] || a.index - b.index)
    .map(({ row }) => row)
}
