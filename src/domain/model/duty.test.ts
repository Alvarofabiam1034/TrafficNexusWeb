import { describe, expect, it } from 'vitest'

import { isLostInDuty, toolReviewRows, type DutyChecklistLine, type DutyDetail } from './duty'

const line = (mark: DutyChecklistLine['mark'], openMark: DutyChecklistLine['openMark']): DutyChecklistLine => ({
  id: 'l1',
  itemId: 'i1',
  itemName: 'Multímetro',
  groupName: 'Herramienta eléctrica',
  brand: '',
  serial: '',
  mark,
  markedByName: '',
  openMark,
})

describe('isLostInDuty', () => {
  it('marca la herramienta que salió OK y vuelve faltando', () => {
    expect(isLostInDuty(line('MISSING', 'OK'))).toBe(true)
  })

  it('marca la herramienta que falta al cierre y no estaba en la apertura', () => {
    expect(isLostInDuty(line('MISSING', null))).toBe(true)
  })

  it('no marca la herramienta que ya faltaba al abrir', () => {
    expect(isLostInDuty(line('MISSING', 'MISSING'))).toBe(false)
  })

  it('no marca la herramienta que vuelve', () => {
    expect(isLostInDuty(line('OK', 'MISSING'))).toBe(false)
  })
})

describe('toolReviewRows', () => {
  const tool = (itemId: string, mark: DutyChecklistLine['mark'], openMark: DutyChecklistLine['openMark'] = null) => ({
    ...line(mark, openMark),
    id: `line-${itemId}`,
    itemId,
    itemName: itemId,
  })
  const duty: DutyDetail['duty'] = {
    id: 'd1',
    crewId: 'c1',
    vehicleId: 'v1',
    plate: 'LQO596',
    state: 'CLOSED',
    openedAt: '',
    closedAt: null,
    openedByName: '',
    closedByName: '',
    closeReason: '',
    handoverFromDutyId: null,
    regularizedFromDutyId: null,
  }
  const checklist = (lines: DutyChecklistLine[]) => ({
    id: 'cl',
    status: 'COMPLETED' as const,
    completedAt: null,
    completedByName: '',
    lines,
  })

  it('cruza apertura y cierre y ordena las novedades primero', () => {
    const rows = toolReviewRows({
      duty,
      openChecklist: checklist([tool('drill', 'OK'), tool('meter', 'MISSING'), tool('ladder', 'MISSING'), tool('saw', 'OK')]),
      closeChecklist: checklist([
        tool('drill', 'OK', 'OK'),
        tool('meter', 'MISSING', 'MISSING'),
        tool('ladder', 'OK', 'MISSING'),
        tool('saw', 'MISSING', 'OK'),
      ]),
    })
    expect(rows.map((row) => [row.itemId, row.outcome])).toEqual([
      ['saw', 'LOST'],
      ['meter', 'STILL_MISSING'],
      ['ladder', 'RECOVERED'],
      ['drill', 'OK'],
    ])
  })

  it('sin cierre muestra lo que faltaba al abrir y el resto sin revisar', () => {
    const rows = toolReviewRows({
      duty,
      openChecklist: checklist([tool('drill', 'OK'), tool('meter', 'MISSING')]),
      closeChecklist: null,
    })
    expect(rows.map((row) => [row.itemId, row.outcome])).toEqual([
      ['meter', 'MISSING_AT_OPEN'],
      ['drill', 'NOT_REVIEWED'],
    ])
  })
})
