import type { MapPlace } from '../model/map'
import type { WorkOrder, WorkOrderState } from '../model/workOrder'

/** Estados en los que la OT todavía requiere seguimiento. */
export const ACTIVE_STATES: readonly WorkOrderState[] = ['IN_PROGRESS', 'ASSIGNED', 'DRAFT']

/** ~1 m: el snapshot de la OT guarda las coordenadas del punto al crearla. */
const SAME_POINT_DEGREES = 0.00001

export function isActiveOrder(order: WorkOrder): boolean {
  return ACTIVE_STATES.includes(order.state)
}

/**
 * OTs de cada punto del mapa visible, de la más reciente a la más antigua.
 * Si el mapa se reimportó, el id del punto cambia: se reconoce por coordenadas.
 */
export function ordersByPlace(places: readonly MapPlace[], orders: readonly WorkOrder[]): Map<string, WorkOrder[]> {
  const result = new Map<string, WorkOrder[]>()
  const byId = new Map(places.map((place) => [place.id, place]))
  for (const order of orders) {
    if (order.kind === 'REQUIREMENT' || !order.place?.id) continue
    const snapshot = order.place
    const place =
      byId.get(snapshot.id) ??
      places.find(
        (candidate) =>
          Math.abs(candidate.latitude - snapshot.latitude) < SAME_POINT_DEGREES &&
          Math.abs(candidate.longitude - snapshot.longitude) < SAME_POINT_DEGREES,
      )
    if (!place) continue
    const list = result.get(place.id)
    if (list) list.push(order)
    else result.set(place.id, [order])
  }
  for (const list of result.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
}

/** Estado activo más avanzado del punto (en progreso > asignada > borrador), o null si no hay OT abierta. */
export function activeStateOf(orders: readonly WorkOrder[] | undefined): WorkOrderState | null {
  if (!orders) return null
  for (const state of ACTIVE_STATES) {
    if (orders.some((order) => order.state === state)) return state
  }
  return null
}
