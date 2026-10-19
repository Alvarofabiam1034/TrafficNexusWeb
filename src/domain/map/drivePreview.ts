/**
 * Convierte un link de Google Drive en una URL embebible (`/preview`)
 * para mostrar el PDF en un iframe sin forzar la descarga.
 *
 * El archivo debe ser visible para quien abre la app (compartido
 * "cualquiera con el enlace" o sesión de Google con acceso).
 */

const FILE_ID = /^[a-zA-Z0-9_-]{10,}$/

function hostIsDrive(hostname: string): boolean {
  return hostname === 'drive.google.com' || hostname === 'docs.google.com' || hostname.endsWith('.drive.google.com')
}

/** Extrae el file id de un URL típico de Drive, o `null` si no aplica. */
export function driveFileId(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (!hostIsDrive(url.hostname)) return null

    const fromPath = url.pathname.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/)
    if (fromPath?.[1] && FILE_ID.test(fromPath[1])) return fromPath[1]

    const fromQuery = url.searchParams.get('id')
    if (fromQuery && FILE_ID.test(fromQuery)) return fromQuery

    return null
  } catch {
    return null
  }
}

/** URL de vista previa embebible, o `null` si `documentation` no es un link de Drive. */
export function drivePreviewUrl(documentation: string): string | null {
  const id = driveFileId(documentation)
  return id ? `https://drive.google.com/file/d/${id}/preview` : null
}
