import type { CrewRole } from './crew'

export const ACCOUNT_ROLES = ['ADMIN', 'OPERATOR'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value)
}

/** Usuario de la cuenta. El backend nunca devuelve la contraseña. */
export interface AppUser {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly accountRole: AccountRole
  /** Nulo en un administrador sin cargo de cuadrilla. */
  readonly crewRole: CrewRole | null
}

export interface Project {
  readonly id: string
  readonly name: string
}

/** Miembro del proyecto. `crewId` indica en qué cuadrilla está sentado. */
export interface ProjectMember {
  readonly userId: string
  readonly fullName: string
  readonly email: string
  readonly accountRole: AccountRole
  readonly crewRole: CrewRole | null
  readonly crewId: string | null
}

export interface Session {
  readonly token: string
  readonly user: AppUser
  readonly projectId: string
}
