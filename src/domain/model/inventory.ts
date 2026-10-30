/** Herramienta se chequea. Consumible se descuenta. Lo define el grupo, no cada ítem. */
export const CATALOG_KINDS = ['TOOL', 'CONSUMABLE'] as const
export type CatalogGroupKind = (typeof CATALOG_KINDS)[number]

export function isCatalogKind(value: unknown): value is CatalogGroupKind {
  return typeof value === 'string' && (CATALOG_KINDS as readonly string[]).includes(value)
}

/** Unidad de magnitud del ítem (etiqueta; las cantidades siguen siendo enteros). */
export const INVENTORY_UNITS = ['METERS', 'UNITS'] as const
export type InventoryUnit = (typeof INVENTORY_UNITS)[number]

export function isInventoryUnit(value: unknown): value is InventoryUnit {
  return typeof value === 'string' && (INVENTORY_UNITS as readonly string[]).includes(value)
}

/** Ítem del catálogo. Pertenece a un grupo. El catálogo no guarda cantidades. */
export interface InventoryItem {
  readonly id: string
  readonly name: string
  readonly unit: InventoryUnit
  /** Posición del ítem dentro de su grupo. Cero es el primero. */
  readonly sortIndex: number
}

/** Sugiere unidad al crear: cables → metros; resto → unidades. */
export function suggestInventoryUnit(name: string): InventoryUnit {
  return /\bcable\b/i.test(name.trim()) ? 'METERS' : 'UNITS'
}

/** Cantidad con etiqueta corta, p. ej. "120 m" / "5 ud". */
export function formatInventoryQuantity(quantity: number, unit: InventoryUnit): string {
  return `${quantity} ${unit === 'METERS' ? 'm' : 'ud'}`
}

/** Grupo de ítems. El grupo existe porque tiene ítems. */
export interface InventoryGroup {
  readonly id: string
  readonly name: string
  readonly kind: CatalogGroupKind | null
  readonly sortIndex: number
  readonly items: readonly InventoryItem[]
}
