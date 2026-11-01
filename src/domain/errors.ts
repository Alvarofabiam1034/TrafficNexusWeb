export type DomainErrorKind =
  | 'INVALID'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NETWORK'
  | 'UNKNOWN'

/**
 * Único error que atraviesa las capas. La infraestructura traduce HTTP a esto;
 * la interfaz solo necesita `kind` y `message`.
 */
export class DomainError extends Error {
  readonly kind: DomainErrorKind
  readonly status: number
  /** Código de negocio del backend (p. ej. CREW_OUTSIDE_SCHEDULE). */
  readonly code?: string

  constructor(kind: DomainErrorKind, message: string, status = 0, code?: string) {
    super(message)
    this.name = 'DomainError'
    this.kind = kind
    this.status = status
    this.code = code
  }

  static is(error: unknown, kind?: DomainErrorKind): error is DomainError {
    return error instanceof DomainError && (kind === undefined || error.kind === kind)
  }

  static hasCode(error: unknown, code: string): error is DomainError {
    return error instanceof DomainError && error.code === code
  }
}

/** La caja conserva cantidades mayores a cero, así que esa placa o ese ítem no se puede borrar. */
export class KitQuantityBlockedError extends DomainError {
  constructor() {
    super('CONFLICT', 'Todavía hay cantidades mayores que 0')
    this.name = 'KitQuantityBlockedError'
  }
}

export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
