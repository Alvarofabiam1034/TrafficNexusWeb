import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { EvidencePhoto } from '@/domain/model/evidence'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

/** Polling del álbum mientras el detalle de OT está abierto (evidencias en vivo). */
const EVIDENCE_POLL_MS = 8_000

export function useWorkOrderEvidences(workOrderId: string | null) {
  const { evidences } = useContainer()
  const { projectId } = useRequiredSession()
  return useQuery({
    queryKey: queryKeys.evidences(projectId, workOrderId ?? ''),
    queryFn: () => evidences.listByWorkOrder(projectId, workOrderId!),
    enabled: workOrderId !== null && workOrderId.length > 0,
    refetchInterval: EVIDENCE_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}

function patchEvidenceInAlbum(
  client: ReturnType<typeof useQueryClient>,
  projectId: string,
  workOrderId: string | null,
  photo: EvidencePhoto,
) {
  client.setQueryData(queryKeys.evidence(projectId, photo.id), photo)
  if (!workOrderId) return
  client.setQueryData(queryKeys.evidences(projectId, workOrderId), (list: EvidencePhoto[] | undefined) =>
    list ? list.map((item) => (item.id === photo.id ? photo : item)) : list,
  )
}

export function useRefreshEvidenceUrl(workOrderId: string | null) {
  const { evidences } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (evidenceId: string) => evidences.get(projectId, evidenceId),
    onSuccess: (photo) => patchEvidenceInAlbum(client, projectId, workOrderId, photo),
  })
}

export function useUpdateEvidenceCaption(workOrderId: string | null) {
  const { evidences } = useContainer()
  const { projectId } = useRequiredSession()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ evidenceId, caption }: { evidenceId: string; caption: string }) =>
      evidences.updateCaption(projectId, evidenceId, caption),
    onSuccess: (photo) => patchEvidenceInAlbum(client, projectId, workOrderId, photo),
  })
}
