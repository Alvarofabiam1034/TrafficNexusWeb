import { describe, expect, it } from 'vitest'

import { workfrontColor, workfrontStroke } from './workfronts'

describe('workfront colors', () => {
  it('da un color distinto a cada frente y el mismo a sus trazos', () => {
    expect(workfrontStroke('WF1 - Norte')).toBe(workfrontColor(1))
    expect(workfrontStroke('WF 2 Corredor')).toBe(workfrontColor(2))
    expect(workfrontStroke('WF1 - Norte')).not.toBe(workfrontStroke('WF 2 Corredor'))
    expect(workfrontStroke('Acceso sin frente')).toBeNull()
  })

  it('repite la paleta sin salirse cuando hay más de doce frentes', () => {
    expect(workfrontColor(13)).toBe(workfrontColor(1))
    expect(workfrontColor(0)).toBe(workfrontColor(12))
  })
})
