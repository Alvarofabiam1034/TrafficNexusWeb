import type { Crew } from '../model/crew'
import type { CrewShift } from '../model/shift'
import type { PlateError } from '../validation/crewValidator'
import {
  civilDate,
  compareDates,
  plusDays,
  sameDate,
  toEpochDay,
  weekdayOf,
  type CivilDate,
} from './civilDate'

/** Un turno ya puesto en el calendario: de `startMinute` a `endMinute`, en minutos absolutos. */
export interface ShiftSpan {
  readonly crewId: string
  readonly shiftId: string
  readonly plate: string
  readonly startDate: CivilDate
  readonly startMinute: number
  readonly endMinute: number
  readonly holiday: boolean
}

/** Dos turnos de la misma placa que se pisan. `minutes` es mayor que cero. */
export interface SpanOverlap {
  readonly plate: string
  readonly left: ShiftSpan
  readonly right: ShiftSpan
  readonly minutes: number
  readonly overlapStart: number
  readonly overlapEnd: number
}

export interface ShareProblem {
  readonly kind: 'EXCESSIVE_OVERLAP'
  readonly plate: string
  readonly overlap: SpanOverlap
}

export const MAX_HANDOVER_MINUTES = 60
const MINUTES_PER_DAY = 1440
const DRAFT_ID = '__draft__'

/** Lunes 1 de enero de 2024. Sirve para medir el horario que se repite. */
const CANONICAL_MONDAY = civilDate(2024, 1, 1)

interface MaterializeOptions {
  readonly from: CivilDate
  readonly until: CivilDate
  readonly includeDated: boolean
  readonly applyHoliday: boolean
}

/**
 * Arma la semana y aplica la regla del relevo.
 *
 * El habitual se revisa en una semana fija, sin festivos, porque se repite igual
 * todas las semanas. Cada turno de una fecha se revisa aparte, en la ventana de
 * ese día, ya con el festivo apagando el habitual de su cuadrilla.
 */
export function materialize(crews: readonly Crew[], options: MaterializeOptions): ShiftSpan[] {
  const { from, until, includeDated, applyHoliday } = options
  if (compareDates(from, until) > 0) return []
  const spans: ShiftSpan[] = []
  let date = from
  while (compareDates(date, until) <= 0) {
    for (const crew of crews) {
      const holidays = applyHoliday ? holidayDates(crew) : []
      for (const shift of crew.shifts) {
        const occurs =
          shift.date === null
            ? shift.weekdays.has(weekdayOf(date)) && !holidays.some((h) => sameDate(h, date))
            : includeDated && sameDate(shift.date, date)
        if (occurs) {
          const span = spanOf(crew, shift, date)
          if (span) spans.push(span)
        }
      }
    }
    date = plusDays(date, 1)
  }
  return spans
}

/** Turnos cuya barra cae, aunque sea en parte, dentro de la semana que empieza el lunes `weekStart`. */
export function materializeWeek(crews: readonly Crew[], weekStart: CivilDate): ShiftSpan[] {
  const spans = materialize(crews, {
    from: plusDays(weekStart, -1),
    until: plusDays(weekStart, 6),
    includeDated: true,
    applyHoliday: true,
  })
  const windowStart = toEpochDay(weekStart) * MINUTES_PER_DAY
  const windowEnd = (toEpochDay(weekStart) + 7) * MINUTES_PER_DAY
  return spans.filter((span) => span.endMinute > windowStart && span.startMinute < windowEnd)
}

export function overlaps(spans: readonly ShiftSpan[]): SpanOverlap[] {
  const found: SpanOverlap[] = []
  const byPlate = new Map<string, ShiftSpan[]>()
  for (const span of spans) {
    const group = byPlate.get(span.plate)
    if (group) group.push(span)
    else byPlate.set(span.plate, [span])
  }
  for (const group of byPlate.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex++) {
        const left = group[leftIndex] as ShiftSpan
        const right = group[rightIndex] as ShiftSpan
        const start = Math.max(left.startMinute, right.startMinute)
        const end = Math.min(left.endMinute, right.endMinute)
        const minutes = end - start
        if (minutes > 0) {
          found.push({ plate: left.plate, left, right, minutes, overlapStart: start, overlapEnd: end })
        }
      }
    }
  }
  return found
}

export function problems(crews: readonly Crew[]): ShareProblem[] {
  const found: ShareProblem[] = []
  const grouped = new Map<string, Crew[]>()
  for (const crew of crews) {
    if (!crew.vehiclePlate) continue
    const list = grouped.get(crew.vehiclePlate)
    if (list) list.push(crew)
    else grouped.set(crew.vehiclePlate, [crew])
  }
  for (const [plate, group] of grouped) {
    // Una cuadrilla nueva todavía no tiene turno. Puede llevar la placa;
    // el relevo se mide cuando ya hay horario en los dos lados.
    const scheduled = group.filter((crew) => crew.shifts.length > 0)
    const totalShifts = scheduled.reduce((sum, crew) => sum + crew.shifts.length, 0)
    if (scheduled.length < 2 && totalShifts < 2) continue
    // Un día antes y uno después: el nocturno del domingo entra el lunes,
    // y hay que verlo junto con el turno de esa mañana.
    consider(
      found,
      plate,
      materialize(scheduled, {
        from: plusDays(CANONICAL_MONDAY, -1),
        until: plusDays(CANONICAL_MONDAY, 7),
        includeDated: false,
        applyHoliday: false,
      }),
    )
    const dates = uniqueDates(group.flatMap((crew) => crew.shifts.map((s) => s.date)).filter(isDate))
    for (const date of dates) {
      consider(
        found,
        plate,
        materialize(scheduled, {
          from: plusDays(date, -1),
          until: plusDays(date, 1),
          includeDated: true,
          applyHoliday: true,
        }),
      )
    }
  }
  return found
}

/**
 * Placa que esta cuadrilla, con `shifts`, no puede tomar.
 * `others` son las demás cuadrillas, sin esta.
 */
export function plateShareError(
  plate: string,
  shifts: readonly CrewShift[],
  others: readonly Crew[],
): PlateError | null {
  const samePlate = others.filter((crew) => crew.vehiclePlate === plate)
  if (samePlate.length === 0 && shifts.length < 2) return null
  const draft = draftCrew(plate, shifts)
  const problem = problems([...samePlate, draft])[0]
  return problem ? 'OVERLAP' : null
}

export function blockedPlates(
  shifts: readonly CrewShift[],
  others: readonly Crew[],
  plates: readonly string[],
): Map<string, PlateError> {
  const blocked = new Map<string, PlateError>()
  for (const plate of plates) {
    const error = plateShareError(plate, shifts, others)
    if (error) blocked.set(plate, error)
  }
  return blocked
}

function consider(found: ShareProblem[], plate: string, spans: readonly ShiftSpan[]): void {
  for (const overlap of overlaps(spans)) {
    if (overlap.minutes > MAX_HANDOVER_MINUTES) {
      found.push({ kind: 'EXCESSIVE_OVERLAP', plate, overlap })
    }
  }
}

function holidayDates(crew: Crew): CivilDate[] {
  return crew.shifts.filter((shift) => shift.holiday && shift.date).map((shift) => shift.date as CivilDate)
}

function isDate(value: CivilDate | null): value is CivilDate {
  return value !== null
}

function uniqueDates(dates: readonly CivilDate[]): CivilDate[] {
  const seen = new Set<number>()
  const result: CivilDate[] = []
  for (const date of dates) {
    const key = toEpochDay(date)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(date)
    }
  }
  return result
}

function spanOf(crew: Crew, shift: CrewShift, date: CivilDate): ShiftSpan | null {
  if (shift.startMinute < 0 || shift.startMinute > 1439) return null
  if (shift.endMinute < 0 || shift.endMinute > 1439) return null
  const epoch = toEpochDay(date)
  const start = epoch * MINUTES_PER_DAY + shift.startMinute
  const end =
    shift.endMinute > shift.startMinute
      ? epoch * MINUTES_PER_DAY + shift.endMinute
      : (epoch + 1) * MINUTES_PER_DAY + shift.endMinute
  return {
    crewId: crew.id,
    shiftId: shift.id,
    plate: crew.vehiclePlate,
    startDate: date,
    startMinute: start,
    endMinute: end,
    holiday: shift.holiday,
  }
}

function draftCrew(plate: string, shifts: readonly CrewShift[]): Crew {
  const empty = { fullName: '', userId: '' }
  return {
    id: DRAFT_ID,
    leadTechnician: empty,
    auxiliaryTechnician: empty,
    boomOperator: empty,
    corporatePhone: '',
    vehicleId: '',
    vehiclePlate: plate,
    shifts,
  }
}

/** Habituales primero (por hora), luego los de fecha en orden cronológico. */
export function sortShifts(shifts: readonly CrewShift[]): CrewShift[] {
  return [...shifts].sort((left, right) => {
    if (left.date === null && right.date !== null) return -1
    if (left.date !== null && right.date === null) return 1
    if (left.date !== null && right.date !== null) return compareDates(left.date, right.date)
    return left.startMinute - right.startMinute
  })
}

/** Habituales y turnos de fecha que todavía no pasaron. */
export function shiftsForCard(shifts: readonly CrewShift[], todayDate: CivilDate): CrewShift[] {
  const habitual = shifts.filter((s) => s.date === null).sort((a, b) => a.startMinute - b.startMinute)
  const upcoming = shifts
    .filter((s) => s.date !== null && compareDates(s.date, todayDate) >= 0)
    .sort((a, b) => compareDates(a.date as CivilDate, b.date as CivilDate))
  return [...habitual, ...upcoming]
}

/** Qué parte del día (0..1) ocupa un intervalo absoluto. Nulo si no toca ese día. */
export function portionOnDay(
  startMinute: number,
  endMinute: number,
  day: CivilDate,
): { offset: number; length: number } | null {
  const dayStart = toEpochDay(day) * MINUTES_PER_DAY
  const dayEnd = dayStart + MINUTES_PER_DAY
  const from = Math.max(startMinute, dayStart)
  const to = Math.min(endMinute, dayEnd)
  if (to <= from) return null
  return { offset: (from - dayStart) / MINUTES_PER_DAY, length: (to - from) / MINUTES_PER_DAY }
}
