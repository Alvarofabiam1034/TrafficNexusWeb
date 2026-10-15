import { WEEKDAYS, type Weekday } from '../model/shift'

/** Cómo se lee un conjunto de días: todos, un tramo seguido, o una lista suelta. */
export type WeekdayLabel =
  | { kind: 'all' }
  | { kind: 'run'; from: Weekday; to: Weekday }
  | { kind: 'list'; days: readonly Weekday[] }

/**
 * Lun–sáb es un tramo. Dom–vie también: el domingo y el viernes se tocan
 * dando la vuelta a la semana. Si hay huecos, se listan sueltos.
 */
export function weekdayLabelOf(days: ReadonlySet<Weekday>): WeekdayLabel {
  if (days.size === WEEKDAYS.length) return { kind: 'all' }
  if (days.size === 0) return { kind: 'list', days: [] }

  const flags = WEEKDAYS.map((day) => days.has(day))
  const gap = flags.indexOf(false)
  const rotated = flags.map((_, index) => flags[(index + gap) % flags.length] as boolean)
  const runs: Array<[start: number, length: number]> = []
  let index = 0
  while (index < rotated.length) {
    if (!rotated[index]) {
      index++
      continue
    }
    const start = index
    while (index < rotated.length && rotated[index]) index++
    runs.push([(start + gap) % flags.length, index - start])
  }
  if (runs.length === 1) {
    const [start, length] = runs[0] as [number, number]
    return {
      kind: 'run',
      from: WEEKDAYS[start] as Weekday,
      to: WEEKDAYS[(start + length - 1) % WEEKDAYS.length] as Weekday,
    }
  }
  return { kind: 'list', days: WEEKDAYS.filter((day) => days.has(day)) }
}
