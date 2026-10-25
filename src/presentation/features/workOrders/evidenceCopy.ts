import { formatEvidenceWhatsApp, type EvidencePhoto } from '@/domain/model/evidence'
import { formatDateTime } from '@/presentation/i18n/labels'

/** Resumen del álbum (o una foto) listo para pegar en WhatsApp. */
export function evidenceWhatsAppMessage(
  photos: readonly EvidencePhoto[],
  externalNumber?: string,
): string {
  const dated = photos.map((photo) => ({
    ...photo,
    capturedAt: formatDateTime(photo.capturedAt) || photo.capturedAt,
  }))
  return formatEvidenceWhatsApp(dated, { externalNumber })
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
