export const MAX_QUANTITY = 9999

export function validQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= MAX_QUANTITY
}

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0
  return Math.min(MAX_QUANTITY, Math.max(0, Math.trunc(quantity)))
}

/** Alguna línea con cantidad mayor que 0 impide borrar la placa o el ítem. */
export function deletionBlocked(quantities: readonly number[]): boolean {
  return quantities.some((quantity) => quantity > 0)
}
