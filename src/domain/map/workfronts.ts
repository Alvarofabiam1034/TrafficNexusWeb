import type { MapLine, MapPlace } from '../model/map'

export interface Workfront {
  readonly number: number
  readonly lineIds: ReadonlySet<string>
  readonly placeIds: ReadonlySet<string>
}

const EARTH_RADIUS_METERS = 6_371_000
const WORKFRONT_NAME = /WF\s*(\d+)/i

/**
 * Un lugar entra al workfront del trazo más cercano cuando está a esta distancia o menos.
 * Más allá queda solo en la vista general: no pertenece con claridad a ningún corredor.
 */
export const WORKFRONT_MAX_DISTANCE_METERS = 250

export function workfronts(
  places: readonly MapPlace[],
  lines: readonly MapLine[],
  maxDistanceMeters = WORKFRONT_MAX_DISTANCE_METERS,
): Workfront[] {
  const tagged: Array<[number, MapLine]> = []
  for (const line of lines) {
    const number = workfrontNumber(line.name)
    if (number !== null) tagged.push([number, line])
  }
  if (tagged.length === 0) return []

  const linesByNumber = new Map<number, string[]>()
  for (const [number, line] of tagged) {
    const list = linesByNumber.get(number)
    if (list) list.push(line.id)
    else linesByNumber.set(number, [line.id])
  }

  const placesByNumber = new Map<number, Set<string>>()
  for (const place of places) {
    let bestNumber = Number.MAX_SAFE_INTEGER
    let bestDistance = Number.POSITIVE_INFINITY
    for (const [number, line] of tagged) {
      const distance = distanceToLineMeters(place.latitude, place.longitude, line)
      const closer = distance < bestDistance
      const tie = distance === bestDistance && number < bestNumber
      if (closer || tie) {
        bestDistance = distance
        bestNumber = number
      }
    }
    if (bestDistance <= maxDistanceMeters) {
      const set = placesByNumber.get(bestNumber)
      if (set) set.add(place.id)
      else placesByNumber.set(bestNumber, new Set([place.id]))
    }
  }

  return [...linesByNumber.keys()]
    .sort((a, b) => a - b)
    .map((number) => ({
      number,
      lineIds: new Set(linesByNumber.get(number) ?? []),
      placeIds: placesByNumber.get(number) ?? new Set<string>(),
    }))
}

function workfrontNumber(name: string): number | null {
  const match = WORKFRONT_NAME.exec(name)
  if (!match || match[1] === undefined) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isNaN(value) ? null : value
}

function distanceToLineMeters(latitude: number, longitude: number, line: MapLine): number {
  const points = line.points
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (points.length === 1) {
    const only = points[0] as MapLine['points'][number]
    return distanceMeters(latitude, longitude, only.latitude, only.longitude)
  }
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index] as MapLine['points'][number]
    const end = points[index + 1] as MapLine['points'][number]
    const distance = distanceToSegmentMeters(
      latitude,
      longitude,
      start.latitude,
      start.longitude,
      end.latitude,
      end.longitude,
    )
    if (distance < best) best = distance
  }
  return best
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** El punto consultado queda en el origen. Devuelve el desplazamiento este y norte, en metros. */
function metersFrom(
  originLat: number,
  originLon: number,
  latitude: number,
  longitude: number,
): [east: number, north: number] {
  const east = toRadians(longitude - originLon) * EARTH_RADIUS_METERS * Math.cos(toRadians(originLat))
  const north = toRadians(latitude - originLat) * EARTH_RADIUS_METERS
  return [east, north]
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const [east, north] = metersFrom(lat1, lon1, lat2, lon2)
  return Math.hypot(east, north)
}

function distanceToSegmentMeters(
  latitude: number,
  longitude: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): number {
  const [startEast, startNorth] = metersFrom(latitude, longitude, startLat, startLon)
  const [endEast, endNorth] = metersFrom(latitude, longitude, endLat, endLon)
  const spanEast = endEast - startEast
  const spanNorth = endNorth - startNorth
  const spanLengthSquared = spanEast * spanEast + spanNorth * spanNorth
  if (spanLengthSquared === 0) return Math.hypot(startEast, startNorth)
  const projection = (-startEast * spanEast + -startNorth * spanNorth) / spanLengthSquared
  const clamped = Math.min(1, Math.max(0, projection))
  const closestEast = startEast + spanEast * clamped
  const closestNorth = startNorth + spanNorth * clamped
  return Math.hypot(closestEast, closestNorth)
}
