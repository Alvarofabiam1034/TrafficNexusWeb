import { describe, expect, it } from 'vitest'

import type { Crew } from '../model/crew'
import type { CrewShift, Weekday } from '../model/shift'
import { civilDate } from './civilDate'
import { materializeWeek, overlaps, plateShareError, problems, shiftsForCard, sortShifts } from './scheduleRules'

const ALL_WEEK: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

function shift(partial: Partial<CrewShift> & { id: string }): CrewShift {
  return {
    startMinute: 6 * 60,
    endMinute: 14 * 60,
    weekdays: new Set(ALL_WEEK),
    date: null,
    holiday: false,
    ...partial,
  }
}

function crew(id: string, plate: string, shifts: CrewShift[]): Crew {
  const person = { fullName: 'Persona Prueba', userId: `${id}-u` }
  return {
    id,
    leadTechnician: person,
    auxiliaryTechnician: person,
    boomOperator: person,
    corporatePhone: '3001234567',
    vehicleId: `${plate}-id`,
    vehiclePlate: plate,
    shifts,
  }
}

describe('scheduleRules', () => {
  it('permite un relevo de hasta 60 minutos en la misma placa', () => {
    const morning = crew('a', 'ABC123', [shift({ id: 'm', startMinute: 6 * 60, endMinute: 14 * 60 })])
    const afternoon = crew('b', 'ABC123', [shift({ id: 't', startMinute: 13 * 60, endMinute: 22 * 60 })])
    expect(problems([morning, afternoon])).toHaveLength(0)
  })

  it('rechaza cruces mayores a 60 minutos', () => {
    const morning = crew('a', 'ABC123', [shift({ id: 'm', startMinute: 6 * 60, endMinute: 14 * 60 })])
    const late = crew('b', 'ABC123', [shift({ id: 't', startMinute: 12 * 60, endMinute: 22 * 60 })])
    const found = problems([morning, late])
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((problem) => problem.overlap.minutes === 120)).toBe(true)
  })

  it('cuenta el nocturno que termina al día siguiente', () => {
    const night = crew('a', 'ABC123', [shift({ id: 'n', startMinute: 22 * 60, endMinute: 6 * 60 })])
    const morning = crew('b', 'ABC123', [shift({ id: 'm', startMinute: 4 * 60, endMinute: 12 * 60 })])
    const found = problems([night, morning])
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((problem) => problem.overlap.minutes === 120)).toBe(true)
  })

  it('el festivo apaga el habitual de la misma cuadrilla', () => {
    const holiday = civilDate(2026, 10, 12)
    const a = crew('a', 'ABC123', [
      shift({ id: 'h', startMinute: 6 * 60, endMinute: 14 * 60 }),
      shift({ id: 'f', startMinute: 8 * 60, endMinute: 12 * 60, weekdays: new Set(), date: holiday, holiday: true }),
    ])
    const spans = materializeWeek([a], holiday)
    const monday = spans.filter((span) => span.startDate.day === 12)
    expect(monday).toHaveLength(1)
    expect(monday[0]?.shiftId).toBe('f')
  })

  it('plateShareError señala la placa bloqueada', () => {
    const other = crew('b', 'ABC123', [shift({ id: 'm', startMinute: 6 * 60, endMinute: 14 * 60 })])
    const mine = [shift({ id: 'x', startMinute: 6 * 60, endMinute: 14 * 60 })]
    expect(plateShareError('ABC123', mine, [other])).toBe('OVERLAP')
    expect(plateShareError('XYZ789', mine, [other])).toBeNull()
    expect(plateShareError('ABC123', [], [other])).toBeNull()
  })

  it('overlaps mide el cruce en minutos absolutos', () => {
    const a = crew('a', 'ABC123', [shift({ id: 'a', startMinute: 6 * 60, endMinute: 14 * 60 })])
    const b = crew('b', 'ABC123', [shift({ id: 'b', startMinute: 13 * 60 + 30, endMinute: 20 * 60 })])
    const found = overlaps(materializeWeek([a, b], civilDate(2026, 10, 12)))
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((overlap) => overlap.minutes === 30)).toBe(true)
  })

  it('ordena habituales primero y oculta fechas pasadas en la tarjeta', () => {
    const past = shift({ id: 'p', weekdays: new Set(), date: civilDate(2026, 1, 1) })
    const future = shift({ id: 'f', weekdays: new Set(), date: civilDate(2027, 1, 1) })
    const habitual = shift({ id: 'h' })
    expect(sortShifts([future, habitual, past]).map((s) => s.id)).toEqual(['h', 'p', 'f'])
    expect(shiftsForCard([future, habitual, past], civilDate(2026, 10, 14)).map((s) => s.id)).toEqual(['h', 'f'])
  })
})
