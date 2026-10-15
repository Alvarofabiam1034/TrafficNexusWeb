export type EmailError = 'REQUIRED' | 'INVALID' | 'DUPLICATED'
export type PasswordError = 'REQUIRED' | 'TOO_SHORT'

export const MIN_PASSWORD_LENGTH = 6
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateEmail(email: string, otherEmails: readonly string[]): EmailError | null {
  const normalized = normalizeEmail(email)
  if (normalized.length === 0) return 'REQUIRED'
  if (!EMAIL.test(normalized)) return 'INVALID'
  if (otherEmails.some((other) => normalizeEmail(other) === normalized)) return 'DUPLICATED'
  return null
}

export function validatePassword(password: string): PasswordError | null {
  const trimmed = password.trim()
  if (trimmed.length === 0) return 'REQUIRED'
  if (trimmed.length < MIN_PASSWORD_LENGTH) return 'TOO_SHORT'
  return null
}
