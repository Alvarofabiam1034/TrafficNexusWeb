import { describe, expect, it } from 'vitest'

import {
  civilDate,
  fromEpochDay,
  numericLabel,
  parseIso,
  plusDays,
  startOfWeek,
  toEpochDay,
  toIso,
  weekdayOf,
} from './civilDate'

describe('civilDate', () => {
  it('convierte ida y vuelta a días epoch', () => {
    const dates = [civilDate(1970, 1, 1), civilDate(2000, 2, 29), civilDate(2024, 12, 31), civilDate(2026, 10, 14)]
    for (const date of dates) {
      expect(fromEpochDay(toEpochDay(date))).toEqual(date)
    }
    expect(toEpochDay(civilDate(1970, 1, 1))).toBe(0)
  })

  it('conoce el día de la semana', () => {
    expect(weekdayOf(civilDate(2024, 1, 1))).toBe('MONDAY')
    expect(weekdayOf(civilDate(2026, 10, 14))).toBe('WEDNESDAY')
    expect(weekdayOf(civilDate(2026, 10, 18))).toBe('SUNDAY')
  })

  it('encuentra el lunes de la semana', () => {
    expect(startOfWeek(civilDate(2026, 10, 14))).toEqual(civilDate(2026, 10, 12))
    expect(startOfWeek(civilDate(2026, 10, 12))).toEqual(civilDate(2026, 10, 12))
    expect(startOfWeek(civilDate(2026, 10, 18))).toEqual(civilDate(2026, 10, 12))
  })

  it('suma días cruzando meses y años', () => {
    expect(plusDays(civilDate(2026, 12, 31), 1)).toEqual(civilDate(2027, 1, 1))
    expect(plusDays(civilDate(2024, 3, 1), -1)).toEqual(civilDate(2024, 2, 29))
  })

  it('serializa y parsea ISO', () => {
    expect(toIso(civilDate(2026, 3, 5))).toBe('2026-03-05')
    expect(parseIso('2026-03-05')).toEqual(civilDate(2026, 3, 5))
    expect(parseIso('2026-02-30')).toBeNull()
    expect(parseIso('no-es-fecha')).toBeNull()
  })

  it('etiqueta como la app', () => {
    expect(numericLabel(civilDate(2026, 10, 14))).toBe('14/10/2026')
  })
})
