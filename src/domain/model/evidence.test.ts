import { describe, expect, it } from 'vitest'

import { formatEvidenceWhatsApp, type EvidencePhoto } from './evidence'

const sample = (patch: Partial<EvidencePhoto> = {}): EvidencePhoto => ({
  id: '1',
  photoCode: 'ABCD2345EFGH67',
  status: 'READY',
  capturedAt: '2026-10-25T13:55:00-05:00',
  serverReceivedAt: '2026-10-25T13:55:12-05:00',
  addressText: 'Cl. 42 Sur # 78H-28',
  externalNumber: '3468',
  directionText: 'TV 78H X CL 42 SUR',
  caption: 'Poste dañado',
  createdByName: 'Juan Pérez',
  byteSize: 420000,
  readUrl: 'https://example.com/photo.jpg',
  readUrlExpiresAt: '2026-10-25T14:10:00Z',
  ...patch,
})

describe('formatEvidenceWhatsApp', () => {
  it('arma un resumen con encabezado y nota', () => {
    const text = formatEvidenceWhatsApp([sample()])
    expect(text).toContain('*Evidencias OT · Externo 3468*')
    expect(text).toContain('*1. ABCD2345EFGH67*')
    expect(text).toContain('Nota: Poste dañado')
    expect(text).toContain('Cl. 42 Sur # 78H-28')
  })

  it('indica álbum vacío', () => {
    expect(formatEvidenceWhatsApp([], { externalNumber: '100' })).toContain('(Sin fotos listas)')
  })
})
