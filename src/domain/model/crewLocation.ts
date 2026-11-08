import { isCrewRole, type CrewRole } from './crew'

/** Pasado este tiempo desde `receivedAt`, el pin se muestra como posición vieja. */
export const CREW_FIX_STALE_AFTER_MS = 15 * 60 * 1000

export interface CrewLocationMember {
  readonly id: string
  readonly fullName: string
  readonly crewRole: CrewRole
}

export interface CrewLocationReporter {
  readonly id: string
  readonly fullName: string
}

/** Último punto GPS. No hay recorrido: cada reporte reemplaza al anterior. */
export interface CrewFix {
  readonly latitude: number
  readonly longitude: number
  /** Radio en metros. `null` si el teléfono no lo mandó. */
  readonly accuracyMeters: number | null
  /** Hora del GPS en el teléfono, UTC. */
  readonly recordedAt: string
  /** Hora en que el servidor guardó el punto. Sirve para marcar la posición como vieja. */
  readonly receivedAt: string
  readonly reportedBy: CrewLocationReporter
}

/** Una cuadrilla del proyecto y, si alguna vez reportó, su última posición. */
export interface CrewLocation {
  readonly crewId: string
  readonly plate: string
  readonly corporatePhone: string
  readonly vehicleId: string
  readonly lead: CrewLocationMember
  readonly auxiliary: CrewLocationMember
  readonly boom: CrewLocationMember
  /** `null` si esa cuadrilla nunca reportó. No se pinta. */
  readonly location: CrewFix | null
}

export function crewFixAgeMs(receivedAt: string, nowMs: number): number | null {
  const received = Date.parse(receivedAt)
  if (Number.isNaN(received)) return null
  return nowMs - received
}

/** Sin fecha válida, o con más de 15 minutos desde que el servidor recibió el punto. */
export function isCrewFixStale(receivedAt: string, nowMs: number): boolean {
  const age = crewFixAgeMs(receivedAt, nowMs)
  if (age === null) return true
  return age > CREW_FIX_STALE_AFTER_MS
}

export function crewFixAgeLabel(receivedAt: string, nowMs: number): string {
  const age = crewFixAgeMs(receivedAt, nowMs)
  if (age === null || age < 45_000) return 'ahora'
  const minutes = Math.floor(age / 60_000)
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function memberFrom(value: unknown): CrewLocationMember | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const fullName = text(pick(record, 'fullName', 'FullName'))
  const crewRole = pick(record, 'crewRole', 'CrewRole')
  if (!fullName || !isCrewRole(crewRole)) return null
  return { id: text(pick(record, 'id', 'ID')), fullName, crewRole }
}

function fixFrom(value: unknown): CrewFix | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const latitude = finite(pick(record, 'latitude', 'Latitude'))
  const longitude = finite(pick(record, 'longitude', 'Longitude'))
  if (latitude === null || longitude === null) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  const accuracyRaw = pick(record, 'accuracyMeters', 'AccuracyMeters')
  let accuracyMeters: number | null = null
  if (accuracyRaw !== undefined) {
    const accuracy = finite(accuracyRaw)
    accuracyMeters = accuracy !== null && accuracy >= 0 ? accuracy : null
  }
  const reported = pick(record, 'reportedBy', 'ReportedBy')
  const reporter = reported && typeof reported === 'object' ? (reported as Record<string, unknown>) : null
  return {
    latitude,
    longitude,
    accuracyMeters,
    recordedAt: text(pick(record, 'recordedAt', 'RecordedAt')),
    receivedAt: text(pick(record, 'receivedAt', 'ReceivedAt')),
    reportedBy: {
      id: reporter ? text(pick(reporter, 'id', 'ID')) : '',
      fullName: reporter ? text(pick(reporter, 'fullName', 'FullName')) : '',
    },
  }
}

function crewLocationFrom(row: unknown): CrewLocation | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const crewId = text(pick(record, 'crewId', 'CrewID'))
  const plate = text(pick(record, 'plate', 'Plate'))
  const lead = memberFrom(pick(record, 'lead', 'Lead'))
  const auxiliary = memberFrom(pick(record, 'auxiliary', 'Auxiliary'))
  const boom = memberFrom(pick(record, 'boom', 'Boom'))
  if (!crewId || !plate || !lead || !auxiliary || !boom) return null
  const locationRaw = pick(record, 'location', 'Location')
  return {
    crewId,
    plate,
    corporatePhone: text(pick(record, 'corporatePhone', 'CorporatePhone')),
    vehicleId: text(pick(record, 'vehicleId', 'VehicleID')),
    lead,
    auxiliary,
    boom,
    location: locationRaw === undefined ? null : fixFrom(locationRaw),
  }
}

/**
 * Cuerpo de `GET /crew-locations`. `null` si no es un arreglo, o si trae filas
 * y ninguna se puede leer: así no se borra la foto anterior.
 * Una fila ilegible se omite. `location: null` se conserva y no se pinta.
 */
export function crewLocationsFromPayload(payload: unknown): CrewLocation[] | null {
  if (!Array.isArray(payload)) return null
  const parsed: CrewLocation[] = []
  for (const row of payload) {
    const crew = crewLocationFrom(row)
    if (crew) parsed.push(crew)
  }
  if (payload.length > 0 && parsed.length === 0) return null
  return parsed
}
