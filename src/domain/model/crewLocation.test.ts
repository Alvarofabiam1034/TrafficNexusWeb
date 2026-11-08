import { describe, expect, it } from 'vitest'

import { CREW_FIX_STALE_AFTER_MS, crewFixAgeLabel, crewLocationsFromPayload, isCrewFixStale } from './crewLocation'

const lead = { id: 'u1', fullName: 'Ana López', crewRole: 'LEAD_TECHNICIAN' }
const auxiliary = { id: 'u2', fullName: 'Luis Pérez', crewRole: 'AUXILIARY_TECHNICIAN' }
const boom = { id: 'u3', fullName: 'Carlos Ruiz', crewRole: 'BOOM_OPERATOR' }

const row = {
  crewId: '22222222-2222-2222-2222-222222222222',
  plate: 'LQO596',
  corporatePhone: '3001234567',
  vehicleId: '33333333-3333-3333-3333-333333333333',
  lead,
  auxiliary,
  boom,
  location: {
    latitude: 4.60971,
    longitude: -74.08175,
    accuracyMeters: 8.5,
    recordedAt: '2026-11-07T23:55:00Z',
    receivedAt: '2026-11-07T23:55:02Z',
    reportedBy: { id: 'u1', fullName: 'Ana López' },
  },
}

describe('crewLocationsFromPayload', () => {
  it('lee la última posición de cada cuadrilla', () => {
    expect(crewLocationsFromPayload([row])).toEqual([
      {
        crewId: row.crewId,
        plate: 'LQO596',
        corporatePhone: '3001234567',
        vehicleId: row.vehicleId,
        lead,
        auxiliary,
        boom,
        location: row.location,
      },
    ])
  })

  it('conserva una cuadrilla que nunca reportó y una lista vacía', () => {
    const parsed = crewLocationsFromPayload([{ ...row, location: null }])
    expect(parsed?.[0]?.location).toBeNull()
    expect(crewLocationsFromPayload([])).toEqual([])
  })

  it('acepta precisión ausente y un reportero borrado', () => {
    const parsed = crewLocationsFromPayload([
      {
        ...row,
        location: { ...row.location, accuracyMeters: null, reportedBy: { id: '', fullName: 'Ana López' } },
      },
    ])
    expect(parsed?.[0]?.location?.accuracyMeters).toBeNull()
    expect(parsed?.[0]?.location?.reportedBy).toEqual({ id: '', fullName: 'Ana López' })
  })

  it('omite una fila rota y no trata un cuerpo inválido como lista vacía', () => {
    const parsed = crewLocationsFromPayload([{ ...row, plate: '' }, { ...row, crewId: 'otra', plate: 'ABC123' }])
    expect(parsed?.map((crew) => crew.plate)).toEqual(['ABC123'])
    expect(crewLocationsFromPayload(null)).toBeNull()
    expect(crewLocationsFromPayload({})).toBeNull()
    expect(crewLocationsFromPayload([{ ...row, lead: null }])).toBeNull()
  })

  it('no pinta coordenadas imposibles y descarta una precisión negativa', () => {
    const parsed = crewLocationsFromPayload([
      { ...row, location: { ...row.location, latitude: 120 } },
      { ...row, crewId: 'otra', plate: 'ABC123', location: { ...row.location, accuracyMeters: -3 } },
    ])
    expect(parsed?.[0]?.location).toBeNull()
    expect(parsed?.[1]?.location?.accuracyMeters).toBeNull()
    expect(parsed?.[1]?.location?.latitude).toBe(4.60971)
  })
})

describe('isCrewFixStale', () => {
  const receivedAt = '2026-11-07T23:55:02Z'
  const received = Date.parse(receivedAt)

  it('marca vieja solo después de 15 minutos desde receivedAt', () => {
    expect(isCrewFixStale(receivedAt, received + CREW_FIX_STALE_AFTER_MS)).toBe(false)
    expect(isCrewFixStale(receivedAt, received + CREW_FIX_STALE_AFTER_MS + 1)).toBe(true)
    expect(isCrewFixStale('no-es-fecha', received)).toBe(true)
  })

  it('describe la antigüedad', () => {
    expect(crewFixAgeLabel(receivedAt, received + 10_000)).toBe('ahora')
    expect(crewFixAgeLabel(receivedAt, received + 3 * 60_000)).toBe('hace 3 min')
    expect(crewFixAgeLabel(receivedAt, received + 2 * 60 * 60_000)).toBe('hace 2 h')
  })
})
