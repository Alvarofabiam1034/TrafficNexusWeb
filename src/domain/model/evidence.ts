/** Estados de evidencia según el API. El álbum web solo lista READY por defecto. */
export const EVIDENCE_STATUSES = ['READY', 'PENDING_UPLOAD', 'FAILED', 'DELETED'] as const
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number]

export function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && (EVIDENCE_STATUSES as readonly string[]).includes(value)
}

/** Foto de evidencia capturada en campo (Android) y firmada para lectura web. */
export interface EvidencePhoto {
  readonly id: string
  readonly photoCode: string
  readonly status: EvidenceStatus
  readonly capturedAt: string
  readonly serverReceivedAt: string
  readonly addressText: string
  readonly externalNumber: string
  readonly directionText: string
  readonly caption: string
  readonly createdByName: string
  readonly byteSize: number
  /** URL firmada GCS; caduca (~15 min). Vacía si no se pudo firmar. */
  readonly readUrl: string
  readonly readUrlExpiresAt: string
}

/** Texto listo para pegar en WhatsApp (una foto o el álbum completo). */
export function formatEvidenceWhatsApp(
  photos: readonly EvidencePhoto[],
  options?: { externalNumber?: string },
): string {
  const external = options?.externalNumber?.trim() || photos[0]?.externalNumber?.trim() || ''
  const header = external ? `*Evidencias OT · Externo ${external}*` : '*Evidencias OT*'
  if (photos.length === 0) return `${header}\n(Sin fotos listas)`

  const blocks = photos.map((photo, index) => {
    const lines = [
      `*${index + 1}. ${photo.photoCode || 'Foto'}*`,
      [photo.createdByName, photo.capturedAt].filter(Boolean).join(' · '),
      photo.addressText || photo.directionText,
      photo.caption.trim() ? `Nota: ${photo.caption.trim()}` : null,
    ].filter((line): line is string => Boolean(line && line.trim()))
    return lines.join('\n')
  })

  return [header, '', ...blocks].join('\n\n')
}
