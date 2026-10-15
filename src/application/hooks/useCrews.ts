import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Crew } from '@/domain/model/crew'
import type { CrewShift } from '@/domain/model/shift'
import type { CrewDraft, ShiftDraft } from '@/domain/repository'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useCrews() {
  const { crews } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.crews(projectId),
    queryFn: () => crews.list(projectId),
  })
}

export function useProjectMembers() {
  const { projects } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => projects.members(projectId),
  })
}

function useInvalidateCrews() {
  const client = useQueryClient()
  const { projectId } = useRequiredSession()
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.crews(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.members(projectId) }),
    ])
  }
}

export function useSaveCrew() {
  const { crews } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateCrews()
  return useMutation({
    mutationFn: ({ crewId, draft }: { crewId: string | null; draft: CrewDraft }): Promise<Crew> =>
      crewId ? crews.update(projectId, crewId, draft) : crews.create(projectId, draft),
    onSuccess: invalidate,
  })
}

export function useDeleteCrew() {
  const { crews } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateCrews()
  return useMutation({
    mutationFn: (crewId: string) => crews.remove(projectId, crewId),
    onSuccess: invalidate,
  })
}

export function useSaveShift() {
  const { crews } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateCrews()
  return useMutation({
    mutationFn: ({
      crewId,
      shiftId,
      draft,
    }: {
      crewId: string
      shiftId: string | null
      draft: ShiftDraft
    }): Promise<CrewShift> =>
      shiftId ? crews.updateShift(projectId, crewId, shiftId, draft) : crews.createShift(projectId, crewId, draft),
    onSuccess: invalidate,
  })
}

export function useDeleteShift() {
  const { crews } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateCrews()
  return useMutation({
    mutationFn: ({ crewId, shiftId }: { crewId: string; shiftId: string }) =>
      crews.removeShift(projectId, crewId, shiftId),
    onSuccess: invalidate,
  })
}
