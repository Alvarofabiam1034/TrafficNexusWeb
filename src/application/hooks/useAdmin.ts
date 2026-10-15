import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { UserDraft, UserPatch } from '@/domain/repository'

import { useContainer, useRequiredSession } from '../ContainerContext'
import { queryKeys } from '../queryKeys'

export function useProjects() {
  const { projects } = useContainer()
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projects.list(),
    staleTime: 60_000,
  })
}

export function useUsers(enabled = true) {
  const { users } = useContainer()
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => users.list(),
    enabled,
  })
}

function useInvalidateAdmin() {
  const client = useQueryClient()
  const { projectId } = useRequiredSession()
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.users }),
      client.invalidateQueries({ queryKey: queryKeys.members(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.projects }),
    ])
  }
}

/** Crea el usuario y lo agrega al proyecto activo, como hace la app. */
export function useCreateUser() {
  const { users, projects } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (draft: UserDraft) => {
      const created = await users.create(draft)
      await projects.addMember(projectId, created.id)
      return created
    },
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const { users } = useContainer()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: UserPatch }) => users.update(userId, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const { users } = useContainer()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (userId: string) => users.remove(userId),
    onSuccess: invalidate,
  })
}

export function useAddMember() {
  const { projects } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (userId: string) => projects.addMember(projectId, userId),
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const { projects } = useContainer()
  const { projectId } = useRequiredSession()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (userId: string) => projects.removeMember(projectId, userId),
    onSuccess: invalidate,
  })
}

export function useCreateProject() {
  const { projects } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => projects.create(name),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
}

export function useRenameProject() {
  const { projects } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) => projects.rename(projectId, name),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
}
