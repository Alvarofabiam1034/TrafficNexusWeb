import type { CivilDate } from '../schedule/civilDate'

/** Lunes es el primer día: así está armada la semana de las cuadrillas. */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const
export type Weekday = (typeof WEEKDAYS)[number]

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value)
}

/**
 * Un turno de la cuadrilla.
 *
 * El habitual se repite en `weekdays` y no tiene fecha. El de una fecha (una noche extra
 * o un festivo) trae `date` y no usa días. Si `holiday` es verdadero, ese día no salen
 * los turnos habituales de la misma cuadrilla: el festivo los reemplaza.
 *
 * Cuando `endMinute` es menor o igual que `startMinute`, el turno cruza la medianoche
 * y sigue siendo un solo intervalo.
 */
export interface CrewShift {
  readonly id: string
  /** Minuto del día, de 0 a 1439. */
  readonly startMinute: number
  /** Minuto del día, de 0 a 1439. */
  readonly endMinute: number
  readonly weekdays: ReadonlySet<Weekday>
  readonly date: CivilDate | null
  readonly holiday: boolean
}

export const isDated = (shift: CrewShift): boolean => shift.date !== null
export const isOvernight = (shift: CrewShift): boolean => shift.endMinute <= shift.startMinute
