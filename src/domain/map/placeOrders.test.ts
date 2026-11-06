import { describe, expect, it } from 'vitest'

import type { MapPlace } from '../model/map'
import type { WorkOrder, WorkOrderState } from '../model/workOrder'
import { activeStateOf, ordersByPlace } from './placeOrders'

function place(id: string, latitude: number, longitude: number): MapPlace {
  return { id, name: id, description: '', documentation: '', latitude, longitude }
}

function order(id: string, state: WorkOrderState, placeId: string | null, lat = 4.6, lng = -74.1, createdAt = '2026-11-01T10:00:00Z'): WorkOrder {
  return {
    id,
    externalNumber: id,
    statusReported: '',
    rawMessage: '',
    parsedNotes: '',
    adminNotes: '',
    state,
    crewId: null,
    assignedAt: null,
    assignedBy: null,
    assignedByName: '',
    closedAt: null,
    closedBy: null,
    closedByName: '',
    closeComment: '',
    createdAt,
    updatedAt: createdAt,
    createdBy: null,
    createdByName: '',
    place: placeId ? { id: placeId, name: '', latitude: lat, longitude: lng, documentation: '' } : null,
    items: [],
  }
}

describe('placeOrders', () => {
  it('agrupa por id del punto y ordena de la más reciente a la más antigua', () => {
    const places = [place('p1', 4.6, -74.1)]
    const grouped = ordersByPlace(places, [
      order('a', 'DONE', 'p1', 4.6, -74.1, '2026-11-01T10:00:00Z'),
      order('b', 'ASSIGNED', 'p1', 4.6, -74.1, '2026-11-03T10:00:00Z'),
      order('c', 'DRAFT', null),
    ])
    expect(grouped.get('p1')?.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('reconoce el punto por coordenadas cuando el mapa se reimportó', () => {
    const places = [place('nuevo', 4.612345, -74.098765)]
    const grouped = ordersByPlace(places, [order('a', 'ASSIGNED', 'viejo', 4.612345, -74.098765)])
    expect(grouped.get('nuevo')?.map((item) => item.id)).toEqual(['a'])
  })

  it('el estado activo prioriza en progreso, luego asignada, luego borrador', () => {
    expect(activeStateOf([order('a', 'DRAFT', 'p'), order('b', 'IN_PROGRESS', 'p')])).toBe('IN_PROGRESS')
    expect(activeStateOf([order('a', 'DONE', 'p'), order('b', 'ASSIGNED', 'p')])).toBe('ASSIGNED')
    expect(activeStateOf([order('a', 'DONE', 'p')])).toBeNull()
    expect(activeStateOf(undefined)).toBeNull()
  })
})
