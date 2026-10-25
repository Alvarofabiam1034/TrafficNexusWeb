import {
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ImageOff,
  Maximize2,
  Pencil,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type WheelEvent } from 'react'

import {
  useRefreshEvidenceUrl,
  useUpdateEvidenceCaption,
  useWorkOrderEvidences,
} from '@/application/hooks/useEvidences'
import { messageOf } from '@/domain/errors'
import type { EvidencePhoto } from '@/domain/model/evidence'
import { Button, IconButton } from '@/presentation/components/Button'
import { TextAreaField } from '@/presentation/components/Field'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import { copyText, evidenceWhatsAppMessage } from './evidenceCopy'
import './workOrders.css'

interface WorkOrderEvidencesProps {
  workOrderId: string
  externalNumber: string
  canEditCaption: boolean
}

export function WorkOrderEvidences({
  workOrderId,
  externalNumber,
  canEditCaption,
}: WorkOrderEvidencesProps) {
  const album = useWorkOrderEvidences(workOrderId)
  const toast = useToast()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const photos = album.data ?? []

  const copyAlbum = async () => {
    const ok = await copyText(evidenceWhatsAppMessage(photos, externalNumber))
    if (ok) toast.success('Resumen copiado · pégalo en WhatsApp')
    else toast.error('No se pudo copiar al portapapeles')
  }

  return (
    <section className="ot-evidences" aria-labelledby="ot-evidences-title">
      <div className="ot-evidences__head">
        <div>
          <h2 id="ot-evidences-title">Evidencias</h2>
          <p className="muted" style={{ fontSize: '0.8125rem', margin: '4px 0 0' }}>
            Fotos de campo · se actualizan solas cada unos segundos
          </p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            size="sm"
            icon={<RefreshCw />}
            onClick={() => void album.refetch()}
            disabled={album.isFetching}
          >
            Actualizar
          </Button>
          {photos.length > 0 ? (
            <Button variant="outlined" size="sm" icon={<ClipboardCopy />} onClick={() => void copyAlbum()}>
              Copiar para WhatsApp
            </Button>
          ) : null}
        </div>
      </div>

      {album.isPending ? <Loading /> : null}
      {album.isError ? (
        <ErrorState
          message={messageOf(album.error, 'No se pudieron cargar las evidencias.')}
          onRetry={() => void album.refetch()}
        />
      ) : null}
      {album.data && album.data.length === 0 ? (
        <p className="ot-evidences__empty muted">
          Aún no hay fotos listas. Cuando la cuadrilla suba evidencias aparecerán aquí.
        </p>
      ) : null}
      {photos.length > 0 ? (
        <>
          <span className="label">
            {plural(photos.length, 'foto', 'fotos')}
            {album.isFetching ? ' · actualizando…' : ''}
          </span>
          <div className="ot-evidence-grid">
            {photos.map((photo, index) => (
              <EvidenceThumb
                key={photo.id}
                photo={photo}
                workOrderId={workOrderId}
                onOpen={() => setViewerIndex(index)}
              />
            ))}
          </div>
        </>
      ) : null}

      {viewerIndex !== null && photos[viewerIndex] ? (
        <EvidenceViewer
          photos={photos}
          index={viewerIndex}
          workOrderId={workOrderId}
          externalNumber={externalNumber}
          canEditCaption={canEditCaption}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </section>
  )
}

function EvidenceThumb({
  photo,
  workOrderId,
  onOpen,
}: {
  photo: EvidencePhoto
  workOrderId: string
  onOpen: () => void
}) {
  const refresh = useRefreshEvidenceUrl(workOrderId)
  const [broken, setBroken] = useState(!photo.readUrl)
  const src = photo.readUrl

  useEffect(() => {
    setBroken(!photo.readUrl)
  }, [photo.readUrl, photo.id])

  const handleError = () => {
    if (refresh.isPending) {
      setBroken(true)
      return
    }
    refresh.mutate(photo.id, {
      onError: () => setBroken(true),
      onSuccess: (fresh) => {
        if (!fresh.readUrl) setBroken(true)
      },
    })
  }

  return (
    <button type="button" className="ot-evidence-thumb" onClick={onOpen}>
      {broken || !src ? (
        <span className="ot-evidence-thumb__fallback">
          <ImageOff size={22} />
          <span>Sin imagen</span>
        </span>
      ) : (
        <img src={src} alt={photo.caption || photo.photoCode} loading="lazy" onError={handleError} />
      )}
      <span className="ot-evidence-thumb__meta">
        <span className="ot-evidence-thumb__code">{photo.photoCode || 'Foto'}</span>
        <span>{formatDateTime(photo.capturedAt)}</span>
      </span>
      {photo.caption.trim() ? <span className="ot-evidence-thumb__caption">{photo.caption}</span> : null}
    </button>
  )
}

function EvidenceViewer({
  photos,
  index,
  workOrderId,
  externalNumber,
  canEditCaption,
  onIndexChange,
  onClose,
}: {
  photos: readonly EvidencePhoto[]
  index: number
  workOrderId: string
  externalNumber: string
  canEditCaption: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const photo = photos[index]!
  const toast = useToast()
  const refresh = useRefreshEvidenceUrl(workOrderId)
  const updateCaption = useUpdateEvidenceCaption(workOrderId)
  const titleId = useId()
  const [scale, setScale] = useState(1)
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState(photo.caption)
  const [broken, setBroken] = useState(!photo.readUrl)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setScale(1)
    setEditingCaption(false)
    setCaptionDraft(photo.caption)
    setBroken(!photo.readUrl)
  }, [photo.id, photo.caption, photo.readUrl])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    overlayRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      if (event.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndexChange])

  const zoomBy = (delta: number) => setScale((current) => Math.min(4, Math.max(1, current + delta)))

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < 40) return
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 0.2 : -0.2)
  }

  const handleImageError = () => {
    refresh.mutate(photo.id, {
      onError: () => setBroken(true),
      onSuccess: (fresh) => {
        if (!fresh.readUrl) setBroken(true)
      },
    })
  }

  const startEditCaption = () => {
    setCaptionDraft(photo.caption)
    setEditingCaption(true)
  }

  const cancelEditCaption = () => {
    setCaptionDraft(photo.caption)
    setEditingCaption(false)
  }

  const saveCaption = async () => {
    try {
      await updateCaption.mutateAsync({ evidenceId: photo.id, caption: captionDraft })
      setEditingCaption(false)
      toast.success('Nota guardada')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo guardar la nota'))
    }
  }

  const copyOne = async () => {
    const ok = await copyText(evidenceWhatsAppMessage([photo], externalNumber || photo.externalNumber))
    if (ok) toast.success('Texto copiado · pégalo en WhatsApp')
    else toast.error('No se pudo copiar')
  }

  const copyCaptionOnly = async () => {
    const text = (editingCaption ? captionDraft : photo.caption).trim() || photo.photoCode
    const ok = await copyText(text)
    if (ok) toast.success('Nota copiada')
    else toast.error('No se pudo copiar')
  }

  return (
    <div
      className="ot-evidence-viewer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="ot-evidence-viewer__chrome">
        <div className="ot-evidence-viewer__title" id={titleId}>
          <strong>{photo.photoCode || 'Evidencia'}</strong>
          <span className="muted">
            {index + 1} / {photos.length}
            {photo.createdByName ? ` · ${photo.createdByName}` : ''}
          </span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <IconButton label="Alejar" size="sm" onClick={() => zoomBy(-0.25)} disabled={scale <= 1}>
            <ZoomOut />
          </IconButton>
          <IconButton label="Acercar" size="sm" onClick={() => zoomBy(0.25)} disabled={scale >= 4}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Ajuste" size="sm" onClick={() => setScale(1)} disabled={scale === 1}>
            <Maximize2 />
          </IconButton>
          <IconButton label="Cerrar" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>

      <div className="ot-evidence-viewer__stage" onWheel={onWheel}>
        {index > 0 ? (
          <button
            type="button"
            className="ot-evidence-viewer__nav ot-evidence-viewer__nav--prev"
            aria-label="Anterior"
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeft size={28} />
          </button>
        ) : null}
        {broken || !photo.readUrl ? (
          <div className="ot-evidence-viewer__missing">
            <ImageOff size={36} />
            <p>Imagen no disponible</p>
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw />}
              onClick={() => refresh.mutate(photo.id)}
              disabled={refresh.isPending}
            >
              Reintentar URL
            </Button>
          </div>
        ) : (
          <img
            className="ot-evidence-viewer__img"
            src={photo.readUrl}
            alt={photo.caption || photo.photoCode}
            style={{ transform: `scale(${scale})` }}
            onError={handleImageError}
            onDoubleClick={() => setScale((current) => (current > 1 ? 1 : 2))}
          />
        )}
        {index < photos.length - 1 ? (
          <button
            type="button"
            className="ot-evidence-viewer__nav ot-evidence-viewer__nav--next"
            aria-label="Siguiente"
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRight size={28} />
          </button>
        ) : null}
      </div>

      <div className="ot-evidence-viewer__side">
        <dl className="ot-evidence-meta">
          <div>
            <dt>Captura</dt>
            <dd>{formatDateTime(photo.capturedAt) || '—'}</dd>
          </div>
          {photo.externalNumber ? (
            <div>
              <dt>Externo</dt>
              <dd>{photo.externalNumber}</dd>
            </div>
          ) : null}
          {photo.addressText ? (
            <div>
              <dt>Dirección</dt>
              <dd>{photo.addressText}</dd>
            </div>
          ) : null}
          {photo.directionText ? (
            <div>
              <dt>Dirección vial</dt>
              <dd>{photo.directionText}</dd>
            </div>
          ) : null}
        </dl>

        <div className="ot-evidence-note">
          {editingCaption ? (
            <>
              <TextAreaField
                label="Nota"
                value={captionDraft}
                onChange={(event) => setCaptionDraft(event.target.value)}
                rows={5}
                hint="Visible para la cuadrilla y en el resumen de WhatsApp"
              />
              {updateCaption.isError ? (
                <InlineMessage>{messageOf(updateCaption.error, 'Error al guardar')}</InlineMessage>
              ) : null}
              <div className="ot-form__actions" style={{ justifyContent: 'flex-start' }}>
                <Button
                  size="sm"
                  onClick={() => void saveCaption()}
                  disabled={updateCaption.isPending || captionDraft === photo.caption}
                >
                  Guardar
                </Button>
                <Button variant="text" size="sm" onClick={cancelEditCaption} disabled={updateCaption.isPending}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="ot-evidence-note__head">
                <h2>Nota</h2>
                {canEditCaption ? (
                  <Button variant="text" size="sm" icon={<Pencil />} onClick={startEditCaption}>
                    Editar
                  </Button>
                ) : null}
              </div>
              <p className="ot-evidence-note__body">{photo.caption.trim() || 'Sin nota'}</p>
            </>
          )}
        </div>

        <div className="ot-form__actions" style={{ justifyContent: 'flex-start' }}>
          <Button variant="outlined" size="sm" icon={<ClipboardCopy />} onClick={() => void copyCaptionOnly()}>
            Copiar nota
          </Button>
          <Button variant="text" size="sm" icon={<ClipboardCopy />} onClick={() => void copyOne()}>
            Copiar ficha
          </Button>
        </div>
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>
          Doble clic o rueda para zoom · flechas para cambiar de foto
        </p>
      </div>
    </div>
  )
}
