import { isInventoryUnit, type InventoryUnit } from './inventory'

/**
 * Ids que acaban de entrar. `previous === null` es la primera foto (al abrir
 * la app): no son novedad, así que no suenan.
 */
export function newStockAlertIds(previous: ReadonlySet<string> | null, alerts: readonly StockAlert[]): string[] {
  if (previous === null) return []
  const fresh: string[] = []
  for (const alert of alerts) {
    if (!previous.has(alert.kitLineId)) fresh.push(alert.kitLineId)
  }
  return fresh
}

/** Una alerta vigente: un consumible en un vehículo, con stock ≤ umbral. */
export interface StockAlert {
  readonly itemId: string
  readonly itemName: string
  readonly unit: InventoryUnit
  readonly threshold: number
  readonly vehicleId: string
  readonly plate: string
  readonly kitLineId: string
  readonly quantity: number
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value
}

/** El GET usa camelCase. Un snapshot viejo del SSE salía con el nombre del campo Go. */
function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function stockAlertFrom(row: unknown): StockAlert | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const itemId = text(pick(record, 'itemId', 'ItemID'))
  const itemName = text(pick(record, 'itemName', 'ItemName'))
  const vehicleId = text(pick(record, 'vehicleId', 'VehicleID'))
  const plate = text(pick(record, 'plate', 'Plate'))
  const kitLineId = text(pick(record, 'kitLineId', 'KitLineID'))
  const threshold = whole(pick(record, 'threshold', 'Threshold'))
  const quantity = whole(pick(record, 'quantity', 'Quantity'))
  const unit = pick(record, 'unit', 'Unit')
  if (!itemId || !itemName || !vehicleId || !plate || !kitLineId) return null
  if (threshold === null || threshold < 0 || quantity === null || quantity < 0) return null
  return {
    itemId,
    itemName,
    unit: isInventoryUnit(unit) ? unit : 'UNITS',
    threshold,
    vehicleId,
    plate,
    kitLineId,
    quantity,
  }
}

/**
 * Snapshot de `GET /stock-alerts` o del evento SSE `stock_alerts`.
 * `null` si el cuerpo no trae una lista: se conserva el snapshot anterior.
 * Una fila ilegible se omite; el resto sigue.
 */
export function stockAlertsFromPayload(payload: unknown): StockAlert[] | null {
  if (!payload || typeof payload !== 'object' || !('alerts' in payload)) return null
  const alerts = (payload as { alerts: unknown }).alerts
  if (!Array.isArray(alerts)) return null
  const parsed: StockAlert[] = []
  for (const row of alerts) {
    const alert = stockAlertFrom(row)
    if (alert) parsed.push(alert)
  }
  // Filas presentes pero ilegibles: no es un snapshot vacío. Conservar el anterior.
  if (parsed.length === 0 && alerts.length > 0) return null
  return parsed
}
