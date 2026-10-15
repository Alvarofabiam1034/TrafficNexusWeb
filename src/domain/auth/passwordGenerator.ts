/**
 * Contraseña fácil de dictar: 8 caracteres, sin 0, O, 1, l ni I.
 * `crypto.getRandomValues` elige cada carácter.
 */
export const GENERATED_PASSWORD_LENGTH = 8
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generatePassword(random: (bound: number) => number = secureRandom): string {
  let out = ''
  for (let index = 0; index < GENERATED_PASSWORD_LENGTH; index++) {
    out += ALPHABET[random(ALPHABET.length)]
  }
  return out
}

function secureRandom(bound: number): number {
  // Rechazo de muestreo para no sesgar el resultado hacia los primeros caracteres.
  const limit = Math.floor(0x100000000 / bound) * bound
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] as number
  } while (value >= limit)
  return value % bound
}
