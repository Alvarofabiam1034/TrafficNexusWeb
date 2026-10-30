import type { CatalogGroupKind, InventoryUnit } from './inventory'

export interface Vehicle {
  readonly id: string
  readonly plate: string
  readonly kits: readonly VehicleKit[]
}

/** Una línea de la caja: cuánto hay de un ítem en esa placa. El cero es una línea real. */
export interface KitLine {
  readonly id: string
  readonly itemId: string
  readonly itemName: string
  readonly unit: InventoryUnit
  readonly quantity: number
  /** Solo herramientas; vacío en consumibles. */
  readonly brand: string
  readonly serial: string
}

/** Caja de una placa para un grupo del catálogo. */
export interface VehicleKit {
  readonly id: string
  readonly groupId: string
  readonly groupName: string
  readonly kind: CatalogGroupKind | null
  readonly lines: readonly KitLine[]
}

export interface StockMovement {
  readonly id: string
  readonly kitLineId: string
  readonly itemId: string
  readonly itemName: string
  readonly groupName: string
  readonly plate: string
  /** ADJUSTMENT o CONSUMPTION, según el backend. */
  readonly kind: string
  readonly previousQuantity: number
  readonly newQuantity: number
  readonly actorName: string
  readonly createdAt: string
}

export interface ToolCheck {
  readonly id: string
  readonly kitLineId: string
  readonly itemId: string
  readonly itemName: string
  readonly groupName: string
  readonly plate: string
  readonly actorName: string
  readonly createdAt: string
}

export interface KitAssignmentLine {
  readonly itemId: string
  readonly itemName: string
  readonly quantity: number
}

/** Historial: qué caja estuvo en qué placa y cuándo. */
export interface KitAssignment {
  readonly id: string
  readonly groupId: string
  readonly groupName: string
  readonly vehicleId: string
  readonly plate: string
  readonly kitId: string
  readonly assignedAt: string
  readonly unassignedAt: string | null
  readonly assignedByName: string
  readonly unassignedByName: string
  readonly lines: readonly KitAssignmentLine[]
}
