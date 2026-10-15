import type { CrewShift } from './shift'

/** Roles fijos de una cuadrilla de mantenimiento de semaforización. */
export const CREW_ROLES = ['LEAD_TECHNICIAN', 'AUXILIARY_TECHNICIAN', 'BOOM_OPERATOR'] as const
export type CrewRole = (typeof CREW_ROLES)[number]

export function isCrewRole(value: unknown): value is CrewRole {
  return typeof value === 'string' && (CREW_ROLES as readonly string[]).includes(value)
}

/** Persona de una cuadrilla. `userId` es el usuario del backend cuando el puesto ya está asignado. */
export interface CrewMember {
  readonly fullName: string
  readonly userId: string
}

/**
 * Cuadrilla: un técnico líder, un técnico auxiliar, un operador de brazo articulado,
 * un celular corporativo y el vehículo asignado. La caja sigue siendo de la placa.
 */
export interface Crew {
  readonly id: string
  readonly leadTechnician: CrewMember
  readonly auxiliaryTechnician: CrewMember
  readonly boomOperator: CrewMember
  /** 10 dígitos, sin indicativo de país (ej. 3001234567). */
  readonly corporatePhone: string
  readonly vehicleId: string
  /** Placa sin espacios ni guiones, en mayúsculas (ej. ABC123). */
  readonly vehiclePlate: string
  readonly shifts: readonly CrewShift[]
}

export function memberFor(crew: Crew, role: CrewRole): CrewMember {
  switch (role) {
    case 'LEAD_TECHNICIAN':
      return crew.leadTechnician
    case 'AUXILIARY_TECHNICIAN':
      return crew.auxiliaryTechnician
    case 'BOOM_OPERATOR':
      return crew.boomOperator
  }
}
