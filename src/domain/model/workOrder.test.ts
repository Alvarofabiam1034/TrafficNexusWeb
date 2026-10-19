import { describe, expect, it } from 'vitest'

import { externalNumberFromPlaceName, maxPriority } from './workOrder'

describe('workOrder helpers', () => {
  it('extrae número de externo del nombre del place', () => {
    expect(externalNumberFromPlaceName('3391')).toBe('3391')
    expect(externalNumberFromPlaceName('NEI-3391')).toBe('3391')
    expect(externalNumberFromPlaceName('Externo 2201 Norte')).toBe('2201')
    expect(externalNumberFromPlaceName('Sin número')).toBeNull()
  })

  it('elige la prioridad máxima', () => {
    expect(
      maxPriority([
        {
          id: '',
          externalId: '1',
          priority: 'MEDIA',
          address: '',
          equipment: '',
          maintenance: '',
          position: 0,
        },
        {
          id: '',
          externalId: '2',
          priority: 'MUY ALTA',
          address: '',
          equipment: '',
          maintenance: '',
          position: 1,
        },
      ]),
    ).toBe('MUY ALTA')
  })
})
