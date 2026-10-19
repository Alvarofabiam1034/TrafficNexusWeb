import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { WorkOrderCreateDraft, WorkOrderState, WorkOrderUpdateDraft } from '@/domain/model/workOrder'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useWorkOrders(state?: WorkOrderState) {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.workOrders(projectId, state),
    queryFn: () => workOrders.list(projectId, state),
  })
}

export function useWorkOrder(workOrderId: string | null) {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.workOrder(projectId, workOrderId ?? ''),
    queryFn: () => workOrders.get(projectId, workOrderId!),
    enabled: workOrderId !== null && workOrderId.length > 0,
  })
}

function useInvalidateWorkOrders() {
  const client = useQueryClient()
  const { projectId } = useRequiredSession()
  return async (workOrderId?: string) => {
    await client.invalidateQueries({ queryKey: ['project', projectId, 'work-orders'] })
    if (workOrderId) {
      await client.invalidateQueries({ queryKey: queryKeys.workOrder(projectId, workOrderId) })
    }
  }
}

export function useParseWorkOrder() {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  return useMutation({
    mutationFn: (rawMessage: string) => workOrders.parse(projectId, rawMessage),
  })
}

export function useCreateWorkOrder() {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateWorkOrders()
  return useMutation({
    mutationFn: (draft: WorkOrderCreateDraft) => workOrders.create(projectId, draft),
    onSuccess: (order) => invalidate(order.id),
  })
}

export function useUpdateWorkOrder() {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateWorkOrders()
  return useMutation({
    mutationFn: ({ workOrderId, draft }: { workOrderId: string; draft: WorkOrderUpdateDraft }) =>
      workOrders.update(projectId, workOrderId, draft),
    onSuccess: (order) => invalidate(order.id),
  })
}

export function useAssignWorkOrder() {
  const { workOrders } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateWorkOrders()
  return useMutation({
    mutationFn: ({ workOrderId, crewId }: { workOrderId: string; crewId: string }) =>
      workOrders.assign(projectId, workOrderId, crewId),
    onSuccess: (order) => invalidate(order.id),
  })
}
