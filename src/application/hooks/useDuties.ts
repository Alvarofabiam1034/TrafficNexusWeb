import { useQuery } from '@tanstack/react-query'

import type { DutyHistoryFilter } from '@/domain/model/duty'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useDutyHistory(filter: DutyHistoryFilter) {
  const { duties } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.duties(projectId, filter),
    queryFn: () => duties.history(projectId, filter),
  })
}

export function useDutyDetail(dutyId: string | null) {
  const { duties } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.duty(projectId, dutyId ?? ''),
    queryFn: () => duties.detail(projectId, dutyId!),
    enabled: dutyId !== null && dutyId.length > 0,
  })
}
