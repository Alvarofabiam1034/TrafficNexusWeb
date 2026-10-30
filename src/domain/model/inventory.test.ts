import { describe, expect, it } from 'vitest'

import { formatInventoryQuantity, suggestInventoryUnit } from './inventory'

describe('inventory unit helpers', () => {
  it('sugiere metros para cables', () => {
    expect(suggestInventoryUnit('Cable 3x16')).toBe('METERS')
    expect(suggestInventoryUnit('cable UTP')).toBe('METERS')
  })

  it('sugiere unidades por defecto', () => {
    expect(suggestInventoryUnit('Semáforo S1')).toBe('UNITS')
    expect(suggestInventoryUnit('')).toBe('UNITS')
  })

  it('formatea cantidad con etiqueta corta', () => {
    expect(formatInventoryQuantity(120, 'METERS')).toBe('120 m')
    expect(formatInventoryQuantity(5, 'UNITS')).toBe('5 ud')
  })
})
