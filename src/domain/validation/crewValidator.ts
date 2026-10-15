import { CREW_ROLES, type CrewRole } from '../model/crew'

export type NameError = 'REQUIRED' | 'INVALID_CHARACTERS' | 'INCOMPLETE' | 'DUPLICATED_IN_CREW'
export type PhoneError = 'REQUIRED' | 'INVALID_LENGTH' | 'INVALID_PREFIX' | 'ALREADY_ASSIGNED'
/** OVERLAP: la placa se puede compartir, pero los turnos se pisan más de una hora. */
export type PlateError = 'REQUIRED' | 'INVALID_FORMAT' | 'ALREADY_ASSIGNED' | 'OVERLAP'

export interface CrewValidationResult {
  readonly nameErrors: ReadonlyMap<CrewRole, NameError>
  readonly phoneError: PhoneError | null
  readonly plateError: PlateError | null
  readonly isValid: boolean
}

const PHONE_LENGTH = 10
const NAME_PATTERN = /^\p{L}[\p{L}'\- ]*$/u
const WHITESPACE = /\s+/g
/** Vehículos (ABC123) y motocicletas (ABC12D). */
const PLATE_PATTERN = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/
export const PLATE_LENGTH = 6

/** Quita espacios sobrantes: "  juan   pérez " -> "juan pérez". */
export function normalizeName(raw: string): string {
  return raw.trim().replace(WHITESPACE, ' ')
}

/** Deja solo dígitos: "300 123-4567" -> "3001234567". */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Deja solo letras y dígitos en mayúscula: "abc-123" -> "ABC123". */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function validatePlate(raw: string, platesInUse: ReadonlySet<string> = new Set()): PlateError | null {
  const plate = normalizePlate(raw)
  if (plate.length === 0) return 'REQUIRED'
  if (!PLATE_PATTERN.test(plate)) return 'INVALID_FORMAT'
  if (platesInUse.has(plate)) return 'ALREADY_ASSIGNED'
  return null
}

export function validateName(raw: string): NameError | null {
  const name = normalizeName(raw)
  if (name.length === 0) return 'REQUIRED'
  if (!NAME_PATTERN.test(name)) return 'INVALID_CHARACTERS'
  if (name.split(' ').filter((part) => part.length >= 2).length < 2) return 'INCOMPLETE'
  return null
}

/** Valida celular móvil colombiano: 10 dígitos iniciando en 3. */
export function validatePhone(raw: string, phonesInUse: ReadonlySet<string> = new Set()): PhoneError | null {
  const phone = normalizePhone(raw)
  if (phone.length === 0) return 'REQUIRED'
  if (phone.length !== PHONE_LENGTH) return 'INVALID_LENGTH'
  if (!phone.startsWith('3')) return 'INVALID_PREFIX'
  if (phonesInUse.has(phone)) return 'ALREADY_ASSIGNED'
  return null
}

export function validateCrew(
  names: ReadonlyMap<CrewRole, string>,
  phone: string,
  plate: string,
  phonesInUse: ReadonlySet<string>,
  platesInUse: ReadonlySet<string>,
): CrewValidationResult {
  const errors = new Map<CrewRole, NameError>()
  for (const role of CREW_ROLES) {
    const error = validateName(names.get(role) ?? '')
    if (error) errors.set(role, error)
  }
  // Una misma persona no puede ocupar dos roles en la misma cuadrilla.
  const seen = new Set<string>()
  for (const role of CREW_ROLES) {
    if (errors.has(role)) continue
    const key = normalizeName(names.get(role) ?? '').toLowerCase()
    if (seen.has(key)) errors.set(role, 'DUPLICATED_IN_CREW')
    else seen.add(key)
  }
  const phoneError = validatePhone(phone, phonesInUse)
  const plateError = validatePlate(plate, platesInUse)
  return {
    nameErrors: errors,
    phoneError,
    plateError,
    isValid: errors.size === 0 && phoneError === null && plateError === null,
  }
}

/** "ABC123" -> "ABC 123", como aparece en la placa física. */
export function formatPlate(plate: string): string {
  return plate.length > 3 ? `${plate.slice(0, 3)} ${plate.slice(3)}` : plate
}

/** "3001234567" -> "300 123 4567" */
export function formatPhone(digits: string): string {
  let out = ''
  for (let index = 0; index < digits.length; index++) {
    if (index === 3 || index === 6) out += ' '
    out += digits[index]
  }
  return out
}
