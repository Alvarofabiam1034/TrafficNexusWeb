import type { InventoryGroup } from '../model/inventory'

export type InventoryTextError = 'REQUIRED' | 'TOO_SHORT' | 'DUPLICATE'

export interface InventoryValidation {
  readonly nameError: InventoryTextError | null
  readonly groupError: InventoryTextError | null
  readonly isValid: boolean
}

export const INVENTORY_MIN_LENGTH = 2
export const INVENTORY_MAX_NAME_LENGTH = 80
export const INVENTORY_MAX_GROUP_LENGTH = 40

export function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Clave para comparar nombres sin importar mayúsculas ni tildes:
 * "Ópticas" y "opticas" son el mismo grupo.
 */
export function textKey(raw: string): string {
  return normalizeText(raw)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
}

function validateText(raw: string): InventoryTextError | null {
  const text = normalizeText(raw)
  if (text.length === 0) return 'REQUIRED'
  if (text.length < INVENTORY_MIN_LENGTH) return 'TOO_SHORT'
  return null
}

export function validateInventoryItem(
  name: string,
  groupName: string,
  groups: readonly InventoryGroup[],
  ignoreItemId?: string,
): InventoryValidation {
  const nameError = validateText(name)
  const groupError = validateText(groupName)
  const group = groups.find((g) => textKey(g.name) === textKey(groupName))
  const duplicate =
    nameError === null &&
    groupError === null &&
    (group?.items.some((item) => item.id !== ignoreItemId && textKey(item.name) === textKey(name)) ?? false)
  const finalName = duplicate ? 'DUPLICATE' : nameError
  return { nameError: finalName, groupError, isValid: finalName === null && groupError === null }
}

export function validateGroupRename(
  newName: string,
  originalName: string,
  groups: readonly InventoryGroup[],
): InventoryTextError | null {
  const textError = validateText(newName)
  if (textError) return textError
  const oldKey = textKey(originalName)
  const newKey = textKey(newName)
  const clash = groups.some((g) => textKey(g.name) === newKey && textKey(g.name) !== oldKey)
  return clash ? 'DUPLICATE' : null
}

/**
 * Si ya hay un grupo con el mismo nombre (ignorando mayúsculas y tildes),
 * se conserva la forma en que se escribió la primera vez.
 */
export function canonicalGroupName(typed: string, groups: readonly InventoryGroup[]): string {
  const normalized = normalizeText(typed)
  return groups.find((g) => textKey(g.name) === textKey(normalized))?.name ?? normalized
}

export function findGroup(groups: readonly InventoryGroup[], name: string): InventoryGroup | undefined {
  const key = textKey(name)
  return groups.find((g) => textKey(g.name) === key)
}
