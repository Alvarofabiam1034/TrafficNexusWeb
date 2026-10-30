import { describe, expect, it } from 'vitest'

import type { InventoryGroup } from '../model/inventory'
import { validateEmail, validatePassword } from './appUserValidator'
import { formatPhone, formatPlate, validateName, validatePhone, validatePlate } from './crewValidator'
import { canonicalGroupName, validateGroupRename, validateInventoryItem } from './inventoryValidator'

describe('crewValidator', () => {
  it('valida placas de carro y moto', () => {
    expect(validatePlate('abc 123')).toBeNull()
    expect(validatePlate('ABC12D')).toBeNull()
    expect(validatePlate('')).toBe('REQUIRED')
    expect(validatePlate('AB1234')).toBe('INVALID_FORMAT')
    expect(validatePlate('ABC123', new Set(['ABC123']))).toBe('ALREADY_ASSIGNED')
  })

  it('valida celulares colombianos', () => {
    expect(validatePhone('300 123 4567')).toBeNull()
    expect(validatePhone('3001234')).toBe('INVALID_LENGTH')
    expect(validatePhone('6011234567')).toBe('INVALID_PREFIX')
    expect(validatePhone('3001234567', new Set(['3001234567']))).toBe('ALREADY_ASSIGNED')
  })

  it('exige nombre y apellido', () => {
    expect(validateName('Juan Pérez')).toBeNull()
    expect(validateName('Juan')).toBe('INCOMPLETE')
    expect(validateName('Juan 123')).toBe('INVALID_CHARACTERS')
    expect(validateName('   ')).toBe('REQUIRED')
  })

  it('formatea como la app', () => {
    expect(formatPlate('ABC123')).toBe('ABC 123')
    expect(formatPhone('3001234567')).toBe('300 123 4567')
  })
})

describe('inventoryValidator', () => {
  const groups: InventoryGroup[] = [
    {
      id: 'g1',
      name: 'Ópticas',
      kind: 'CONSUMABLE',
      sortIndex: 0,
      items: [{ id: 'i1', name: 'Lente rojo 200', unit: 'UNITS', sortIndex: 0 }],
    },
  ]

  it('detecta duplicados sin importar tildes ni mayúsculas', () => {
    expect(validateInventoryItem('lente ROJO 200', 'opticas', groups).nameError).toBe('DUPLICATE')
    expect(validateInventoryItem('Lente verde', 'opticas', groups).isValid).toBe(true)
    expect(validateInventoryItem('Lente rojo 200', 'opticas', groups, 'i1').isValid).toBe(true)
  })

  it('conserva el nombre original del grupo', () => {
    expect(canonicalGroupName('OPTICAS', groups)).toBe('Ópticas')
    expect(canonicalGroupName('  Cables  ', groups)).toBe('Cables')
  })

  it('valida renombrar grupos', () => {
    expect(validateGroupRename('Ópticas LED', 'Ópticas', groups)).toBeNull()
    expect(validateGroupRename('opticas', 'Cables', groups)).toBe('DUPLICATE')
    expect(validateGroupRename('O', 'Ópticas', groups)).toBe('TOO_SHORT')
  })
})

describe('appUserValidator', () => {
  it('valida correos', () => {
    expect(validateEmail('ana@yunex.com', [])).toBeNull()
    expect(validateEmail('ana', [])).toBe('INVALID')
    expect(validateEmail('ANA@yunex.com', ['ana@yunex.com'])).toBe('DUPLICATED')
  })

  it('valida contraseñas', () => {
    expect(validatePassword('123456')).toBeNull()
    expect(validatePassword('12345')).toBe('TOO_SHORT')
    expect(validatePassword('')).toBe('REQUIRED')
  })
})
