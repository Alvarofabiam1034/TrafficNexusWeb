import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { KitQuantityBlockedError } from '@/domain/errors'
import { deletionBlocked, validQuantity } from '@/domain/kit/kitRules'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useVehicles() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.vehicles(projectId),
    queryFn: () => fleet.vehicles(projectId),
  })
}

export function useVehicle(vehicleId: string) {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.vehicle(projectId, vehicleId),
    queryFn: () => fleet.vehicle(projectId, vehicleId),
    enabled: vehicleId.length > 0,
  })
}

export function useMovements(vehicleId: string) {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.movements(projectId, vehicleId),
    queryFn: () => fleet.movements(projectId, vehicleId),
    enabled: vehicleId.length > 0,
  })
}

export function useToolChecks(vehicleId: string) {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.toolChecks(projectId, vehicleId),
    queryFn: () => fleet.toolChecks(projectId, vehicleId),
    enabled: vehicleId.length > 0,
  })
}

export function useVehicleAssignments(vehicleId: string) {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.vehicleAssignments(projectId, vehicleId),
    queryFn: () => fleet.vehicleAssignments(projectId, vehicleId),
    enabled: vehicleId.length > 0,
  })
}

function useInvalidateFleet() {
  const client = useQueryClient()
  const { projectId } = useRequiredSession()
  return async (vehicleId?: string) => {
    await client.invalidateQueries({ queryKey: queryKeys.vehicles(projectId) })
    if (vehicleId) {
      await client.invalidateQueries({ queryKey: queryKeys.vehicle(projectId, vehicleId) })
    }
    // Las cuadrillas muestran la placa; si cambia, hay que refrescarlas.
    await client.invalidateQueries({ queryKey: queryKeys.crews(projectId) })
  }
}

export function useCreateVehicle() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: (plate: string) => fleet.createVehicle(projectId, plate),
    onSuccess: () => invalidate(),
  })
}

export function useRenameVehicle() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: ({ vehicleId, plate }: { vehicleId: string; plate: string }) =>
      fleet.renameVehicle(projectId, vehicleId, plate),
    onSuccess: (_, { vehicleId }) => invalidate(vehicleId),
  })
}

export function useDeleteVehicle() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: async (vehicleId: string) => {
      const vehicle = await fleet.vehicle(projectId, vehicleId)
      const quantities = vehicle.kits.flatMap((kit) => kit.lines.map((line) => line.quantity))
      if (deletionBlocked(quantities)) throw new KitQuantityBlockedError()
      await fleet.removeVehicle(projectId, vehicleId)
    },
    onSuccess: () => invalidate(),
  })
}

/** Asigna un grupo y fija las cantidades iniciales mayores que 0. */
export function useAssignKit() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: async ({
      vehicleId,
      groupId,
      quantities,
    }: {
      vehicleId: string
      groupId: string
      quantities: ReadonlyMap<string, number>
    }) => {
      for (const quantity of quantities.values()) {
        if (!validQuantity(quantity)) throw new Error('Cantidad fuera de rango')
      }
      const kit = await fleet.assignKit(projectId, vehicleId, groupId)
      for (const line of kit.lines) {
        const quantity = quantities.get(line.itemId) ?? 0
        if (quantity > 0) await fleet.adjustLine(projectId, line.id, quantity)
      }
      return kit
    },
    onSuccess: (_, { vehicleId }) => invalidate(vehicleId),
  })
}

export function useRemoveKit() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: ({ vehicleId, kitId }: { vehicleId: string; kitId: string }) =>
      fleet.removeKit(projectId, vehicleId, kitId),
    onSuccess: (_, { vehicleId }) => invalidate(vehicleId),
  })
}

export function useReassignKit() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: ({ kitId, targetVehicleId }: { kitId: string; sourceVehicleId: string; targetVehicleId: string }) =>
      fleet.reassignKit(projectId, kitId, targetVehicleId),
    onSuccess: async (_, { sourceVehicleId, targetVehicleId }) => {
      await invalidate(sourceVehicleId)
      await invalidate(targetVehicleId)
    },
  })
}

export function useAdjustLine() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, quantity }: { vehicleId: string; lineId: string; quantity: number }) => {
      if (!validQuantity(quantity)) throw new Error('Cantidad fuera de rango')
      return fleet.adjustLine(projectId, lineId, quantity)
    },
    onSuccess: async (_, { vehicleId }) => {
      await client.invalidateQueries({ queryKey: queryKeys.vehicle(projectId, vehicleId) })
      await client.invalidateQueries({ queryKey: queryKeys.vehicles(projectId) })
    },
  })
}

export function useConsumeLine() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, quantity }: { vehicleId: string; lineId: string; quantity: number }) =>
      fleet.consume(projectId, lineId, quantity),
    onSuccess: async (_, { vehicleId }) => {
      await client.invalidateQueries({ queryKey: queryKeys.vehicle(projectId, vehicleId) })
      await client.invalidateQueries({ queryKey: queryKeys.vehicles(projectId) })
    },
  })
}

export function useCheckTool() {
  const { fleet } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId }: { vehicleId: string; lineId: string }) => fleet.check(projectId, lineId),
    onSuccess: async (_, { vehicleId }) => {
      await client.invalidateQueries({ queryKey: queryKeys.toolChecks(projectId, vehicleId) })
    },
  })
}
