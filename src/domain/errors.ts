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

  constructor(kind: DomainErrorKind, message: string, status = 0) {
    super(message)
    this.name = 'DomainError'
    this.kind = kind
    this.status = status
  }

  static is(error: unknown, kind?: DomainErrorKind): error is DomainError {
    return error instanceof DomainError && (kind === undefined || error.kind === kind)
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
