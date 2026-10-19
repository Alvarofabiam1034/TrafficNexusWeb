import { describe, expect, it } from 'vitest'

import { driveFileId, drivePreviewUrl } from './drivePreview'

describe('drivePreview', () => {
  it('extrae id de /file/d/.../view', () => {
    const id = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    expect(driveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(id)
    expect(drivePreviewUrl(`https://drive.google.com/file/d/${id}/view`)).toBe(
      `https://drive.google.com/file/d/${id}/preview`,
    )
  })

  it('extrae id de open?id= y uc?id=', () => {
    const id = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'
    expect(driveFileId(`https://drive.google.com/open?id=${id}`)).toBe(id)
    expect(driveFileId(`https://drive.google.com/uc?id=${id}&export=download`)).toBe(id)
  })

  it('acepta docs.google.com/file/d/', () => {
    const id = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'
    expect(driveFileId(`https://docs.google.com/file/d/${id}/edit`)).toBe(id)
  })

  it('devuelve null fuera de Drive o con URL inválida', () => {
    expect(driveFileId('https://example.com/file.pdf')).toBeNull()
    expect(driveFileId('no-es-un-url')).toBeNull()
    expect(driveFileId('')).toBeNull()
    expect(drivePreviewUrl('https://example.com/doc.pdf')).toBeNull()
  })
})
