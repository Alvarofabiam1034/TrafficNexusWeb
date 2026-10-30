import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { KitQuantityBlockedError } from '@/domain/errors'
import { deletionBlocked } from '@/domain/kit/kitRules'
import type { CatalogGroupKind, InventoryUnit } from '@/domain/model/inventory'
import type { InventoryItemPatch } from '@/domain/repository'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useInventory() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.inventory(projectId),
    queryFn: () => inventory.groups(projectId),
  })
}

function useInvalidateInventory() {
  const client = useQueryClient()
  const { projectId } = useRequiredSession()
  return async () => {
    await client.invalidateQueries({ queryKey: queryKeys.inventory(projectId) })
    // Las cajas muestran nombres y unidades del catálogo.
    await client.invalidateQueries({ queryKey: queryKeys.vehicles(projectId) })
  }
}

export function useCreateItem() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({
      name,
      groupName,
      kind,
      unit,
    }: {
      name: string
      groupName: string
      kind: CatalogGroupKind | null
      unit: InventoryUnit
    }) => inventory.createItem(projectId, name, groupName, kind, unit),
    onSuccess: invalidate,
  })
}

export function useUpdateItem() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: InventoryItemPatch }) =>
      inventory.updateItem(projectId, itemId, patch),
    onSuccess: invalidate,
  })
}

export function useMoveItem() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ itemId, delta }: { itemId: string; delta: -1 | 1 }) => inventory.moveItem(projectId, itemId, delta),
    onSuccess: invalidate,
  })
}

/** Borra un ítem si ninguna caja lo tiene con cantidad mayor que 0. */
export function useDeleteItem() {
  const { inventory, fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: async (itemId: string) => {
      const vehicles = await fleet.vehicles(projectId)
      const quantities = vehicles.flatMap((vehicle) =>
        vehicle.kits.flatMap((kit) => kit.lines.filter((line) => line.itemId === itemId).map((line) => line.quantity)),
      )
      if (deletionBlocked(quantities)) throw new KitQuantityBlockedError()
      await inventory.removeItem(projectId, itemId)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateGroup() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ groupId, patch }: { groupId: string; patch: { name?: string; kind?: CatalogGroupKind } }) =>
      inventory.updateGroup(projectId, groupId, patch),
    onSuccess: invalidate,
  })
}

export function useMoveGroup() {
  const { inventory } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ groupId, delta }: { groupId: string; delta: -1 | 1 }) =>
      inventory.moveGroup(projectId, groupId, delta),
    onSuccess: invalidate,
  })
}

export function useDeleteGroup() {
  const { inventory, fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const vehicles = await fleet.vehicles(projectId)
      const quantities = vehicles.flatMap((vehicle) =>
        vehicle.kits.filter((kit) => kit.groupId === groupId).flatMap((kit) => kit.lines.map((line) => line.quantity)),
      )
      if (deletionBlocked(quantities)) throw new KitQuantityBlockedError()
      await inventory.removeGroup(projectId, groupId)
    },
    onSuccess: invalidate,
  })
}
