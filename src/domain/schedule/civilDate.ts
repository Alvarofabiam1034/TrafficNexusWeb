import { WEEKDAYS, type Weekday } from '../model/shift'

/**
 * Fecha civil sin hora ni zona. Algoritmo de días de Howard Hinnant
 * (epoch día 0 = 1970-01-01), igual que en la app Android.
 */
export interface CivilDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

const floorDiv = (a: number, b: number): number => Math.floor(a / b)
const floorMod = (a: number, b: number): number => ((a % b) + b) % b

export function civilDate(year: number, month: number, day: number): CivilDate {
  return { year, month, day }
}

export function toEpochDay(date: CivilDate): number {
  const y = date.year - (date.month <= 2 ? 1 : 0)
  const era = floorDiv(y, 400)
  const yoe = y - era * 400
  const doy = Math.trunc((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1
  const doe = yoe * 365 + Math.trunc(yoe / 4) - Math.trunc(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function fromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719468
  const era = floorDiv(z, 146097)
  const doe = z - era * 146097
  const yoe = Math.trunc(
    (doe - Math.trunc(doe / 1460) + Math.trunc(doe / 36524) - Math.trunc(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.trunc(yoe / 4) - Math.trunc(yoe / 100))
  const mp = Math.trunc((5 * doy + 2) / 153)
  const d = doy - Math.trunc((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  return civilDate(y + (m <= 2 ? 1 : 0), m, d)
}

export function plusDays(date: CivilDate, days: number): CivilDate {
  return fromEpochDay(toEpochDay(date) + days)
}

/** Lunes = índice 0, en el mismo orden que `WEEKDAYS`. */
export function weekdayOf(date: CivilDate): Weekday {
  const index = floorMod(toEpochDay(date) + 3, 7)
  return WEEKDAYS[index] as Weekday
}

export function startOfWeek(date: CivilDate): CivilDate {
  return plusDays(date, -WEEKDAYS.indexOf(weekdayOf(date)))
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return toEpochDay(a) - toEpochDay(b)
}

export function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

const pad = (value: number, size: number): string => String(value).padStart(size, '0')

export function toIso(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}

export function parseIso(value: string): CivilDate | null {
  const parts = value.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map((part) => Number.parseInt(part, 10))
  if (y === undefined || m === undefined || d === undefined) return null
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = civilDate(y, m, d)
  return sameDate(fromEpochDay(toEpochDay(date)), date) ? date : null
}

/** Hoy en la zona del navegador. */
export function today(now: Date = new Date()): CivilDate {
  return civilDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** "14/10/2026", como en la app. */
export function numericLabel(date: CivilDate): string {
  return `${date.day}/${date.month}/${date.year}`
}
