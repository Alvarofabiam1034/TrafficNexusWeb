import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { StoredMap } from '@/domain/model/map'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useLatestMap() {
  const { map } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.map(projectId),
    queryFn: () => map.latest(projectId),
    staleTime: 5 * 60_000,
  })
}

export function useMapVersions(enabled = true) {
  const { map } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.mapVersions(projectId),
    queryFn: () => map.versions(projectId),
    enabled,
  })
}

export function useMapVersion(versionId: string | null) {
  const { map } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.mapVersion(projectId, versionId ?? ''),
    queryFn: () => map.version(projectId, versionId ?? ''),
    enabled: versionId !== null,
  })
}

export function useImportMap() {
  const { map } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (stored: StoredMap) => map.import(projectId, stored),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.map(projectId) })
    },
  })
}
