/** Herramienta se chequea. Consumible se descuenta. Lo define el grupo, no cada ítem. */
export const CATALOG_KINDS = ['TOOL', 'CONSUMABLE'] as const
export type CatalogGroupKind = (typeof CATALOG_KINDS)[number]

export function isCatalogKind(value: unknown): value is CatalogGroupKind {
  return typeof value === 'string' && (CATALOG_KINDS as readonly string[]).includes(value)
}

/** Ítem del catálogo. Pertenece a un grupo. El catálogo no guarda cantidades. */
export interface InventoryItem {
  readonly id: string
  readonly name: string
  /** Posición del ítem dentro de su grupo. Cero es el primero. */
  readonly sortIndex: number
}

/** Grupo de ítems. El grupo existe porque tiene ítems. */
export interface InventoryGroup {
  readonly id: string
  readonly name: string
  readonly kind: CatalogGroupKind | null
  readonly sortIndex: number
  readonly items: readonly InventoryItem[]
}
