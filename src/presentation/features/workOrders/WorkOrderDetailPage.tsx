import { ExternalLink, FileText, MapPin, MessageSquareText, Smartphone, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import { useAssignWorkOrder, useUpdateWorkOrder, useWorkOrder } from '@/application/hooks/useWorkOrders'
import { DomainError, messageOf } from '@/domain/errors'
import { drivePreviewUrl } from '@/domain/map/drivePreview'
import type { Crew } from '@/domain/model/crew'
import {
  maxPriority,
  workOrderStateLabel,
  type WorkOrder,
  type WorkOrderItemInput,
  type WorkOrderPlace,
} from '@/domain/model/workOrder'
import { formatPhone, formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button } from '@/presentation/components/Button'
import { SelectField, TextAreaField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Timeline, TimelineStep } from '@/presentation/components/Timeline'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import { WorkOrderEvidences } from './WorkOrderEvidences'
import { priorityTone, STATE_TONE } from './workOrderTone'
import './workOrders.css'

const ITEM_COLUMNS: readonly { key: keyof WorkOrderItemInput; label: string }[] = [
  { key: 'externalId', label: 'ID' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'address', label: 'Dirección' },
  { key: 'equipment', label: 'Equipo' },
  { key: 'maintenance', label: 'Mant.' },
]

export default function WorkOrderDetailPage() {
  const { workOrderId = null } = useParams<{ workOrderId: string }>()
  const order = useWorkOrder(workOrderId)
  const crews = useCrews()
  const isAdmin = useIsAdmin()
  const toast = useToast()
  const navigate = useNavigate()
  const update = useUpdateWorkOrder()
  const assign = useAssignWorkOrder()

  const data = order.data
  const [externalNumber, setExternalNumber] = useState('')
  const [statusReported, setStatusReported] = useState('')
  const [parsedNotes, setParsedNotes] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [items, setItems] = useState<WorkOrderItemInput[]>([])
  const [crewId, setCrewId] = useState('')
  const [hydratedId, setHydratedId] = useState<string | null>(null)

  useEffect(() => {
    if (!data || data.id === hydratedId) return
    setExternalNumber(data.externalNumber)
    setStatusReported(data.statusReported)
    setParsedNotes(data.parsedNotes)
    setAdminNotes(data.adminNotes)
    setItems(
      data.items.map((item) => ({
        externalId: item.externalId,
        priority: item.priority,
        address: item.address,
        equipment: item.equipment,
        maintenance: item.maintenance,
      })),
    )
    setCrewId(data.crewId ?? '')
    setHydratedId(data.id)
  }, [data, hydratedId])

  if (order.isPending) {
    return (
      <>
        <PageHeader title="Orden" backTo={routes.workOrders} />
        <div className="page-body">
          <Loading />
        </div>
      </>
    )
  }

  if (order.isError || !data) {
    return (
      <>
        <PageHeader title="Orden" backTo={routes.workOrders} />
        <div className="page-body">
          <ErrorState message="No se pudo cargar la orden." onRetry={() => void order.refetch()} />
        </div>
      </>
    )
  }

  const crewList = crews.data ?? []
  const crew = crewList.find((item) => item.id === data.crewId)
  const priority = maxPriority(data.items)
  const tone = STATE_TONE[data.state]
  const canEdit = isAdmin && (data.state === 'DRAFT' || data.state === 'ASSIGNED')
  const busy = update.isPending || assign.isPending

  const draft = () => ({
    externalNumber: externalNumber.trim(),
    statusReported: statusReported.trim(),
    parsedNotes: parsedNotes.trim(),
    adminNotes: adminNotes.trim(),
    items: items.filter((item) => item.externalId.trim() || item.address.trim()),
  })

  const setItemField = (index: number, key: keyof WorkOrderItemInput, value: string) =>
    setItems((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  const save = async () => {
    try {
      await update.mutateAsync({ workOrderId: data.id, draft: draft() })
      toast.success('Orden actualizada')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo actualizar'))
    }
  }

  const assignCrew = async () => {
    if (!crewId) {
      toast.error('Selecciona una cuadrilla')
      return
    }
    try {
      if (canEdit) await update.mutateAsync({ workOrderId: data.id, draft: draft() })
      const next = await assign.mutateAsync({ workOrderId: data.id, crewId })
      toast.success(`Asignada al externo ${next.externalNumber}`)
      navigate(routes.workOrder(next.id))
    } catch (error) {
      toast.error(
        DomainError.hasCode(error, 'CREW_OUTSIDE_SCHEDULE')
          ? messageOf(error, 'La cuadrilla está fuera de su franja horaria; no se puede asignar ahora')
          : messageOf(error, 'No se pudo asignar'),
      )
    }
  }

  const itemCount = canEdit ? items.length : data.items.length

  return (
    <>
      <PageHeader
        title={data.externalNumber ? `Externo ${data.externalNumber}` : 'Orden'}
        subtitle={data.place?.name || undefined}
        backTo={routes.workOrders}
      />
      <div className="page-body">
        <div className="wo-detail">
          <section className={`wo-hero wo-hero--${tone}`}>
            <div className="wo-hero__head">
              <div className="wo-hero__title">
                <span className="wo-hero__label">Externo</span>
                <span className="wo-hero__number">{data.externalNumber || '—'}</span>
              </div>
              <div className="wo-hero__chips">
                <span className={`tone-pill tone-pill--dot tone-pill--${tone}`}>{workOrderStateLabel(data.state)}</span>
                {data.statusReported ? <span className="tone-pill tone-pill--info">{data.statusReported}</span> : null}
                {priority ? <span className={`tone-pill tone-pill--${priorityTone(priority)}`}>Prioridad {priority}</span> : null}
              </div>
            </div>
            <OrderTimeline order={data} />
          </section>

          <div className="wo-layout">
            <div className="wo-main">
              {canEdit ? (
                <WoCard title="Datos de la orden">
                  <div className="wo-form-row">
                    <TextField label="Externo" value={externalNumber} onChange={(event) => setExternalNumber(event.target.value)} />
                    <TextField
                      label="Estado reportado"
                      value={statusReported}
                      onChange={(event) => setStatusReported(event.target.value)}
                    />
                  </div>
                  <TextAreaField
                    label="Contexto del reporte"
                    value={parsedNotes}
                    onChange={(event) => setParsedNotes(event.target.value)}
                    rows={4}
                  />
                  <TextAreaField
                    label="Contexto adicional"
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    rows={3}
                  />
                </WoCard>
              ) : null}

              {itemCount > 0 ? (
                <WoCard title="IDs" badge={plural(itemCount, 'equipo', 'equipos')} flush>
                  <div className="wo-table-wrap">
                    <table className="wo-table">
                      <thead>
                        <tr>
                          {ITEM_COLUMNS.map((column) => (
                            <th key={column.key}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {canEdit
                          ? items.map((item, index) => (
                              <tr key={index}>
                                {ITEM_COLUMNS.map((column) => (
                                  <td key={column.key}>
                                    <input
                                      className="ot-inline"
                                      aria-label={`${column.label} fila ${index + 1}`}
                                      value={item[column.key]}
                                      onChange={(event) => setItemField(index, column.key, event.target.value)}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))
                          : data.items.map((item) => (
                              <tr key={item.id || item.externalId + item.address}>
                                <td>
                                  <span className="wo-id">{item.externalId || '—'}</span>
                                </td>
                                <td>
                                  {item.priority ? (
                                    <span className={`tone-pill tone-pill--${priorityTone(item.priority)}`}>{item.priority}</span>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td>{item.address}</td>
                                <td>{item.equipment}</td>
                                <td>{item.maintenance}</td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </WoCard>
              ) : null}

              {!canEdit && (data.parsedNotes || data.adminNotes) ? (
                <WoCard title="Contexto">
                  {data.parsedNotes ? (
                    <div className="wo-note">
                      <span className="wo-note__label">Del reporte</span>
                      <p>{data.parsedNotes}</p>
                    </div>
                  ) : null}
                  {data.adminNotes ? (
                    <div className="wo-note wo-note--accent">
                      <span className="wo-note__label">Adicional</span>
                      <p>{data.adminNotes}</p>
                    </div>
                  ) : null}
                </WoCard>
              ) : null}

              <WoCard>
                <WorkOrderEvidences workOrderId={data.id} externalNumber={data.externalNumber} canEditCaption={isAdmin} />
              </WoCard>

              {data.rawMessage ? (
                <details className="wo-card wo-raw">
                  <summary>
                    <MessageSquareText aria-hidden /> Mensaje original
                  </summary>
                  <pre className="ot-detail__raw">{data.rawMessage}</pre>
                </details>
              ) : null}
            </div>

            <aside className="wo-side">
              <PlaceCard place={data.place} />

              {canEdit ? (
                <WoCard title={data.state === 'ASSIGNED' ? 'Reasignar' : 'Asignación'} accent>
                  {crew ? <CrewSummary crew={crew} /> : null}
                  <SelectField
                    label={data.state === 'ASSIGNED' ? 'Nueva cuadrilla' : 'Cuadrilla'}
                    value={crewId}
                    onChange={(event) => setCrewId(event.target.value)}
                    placeholder="Selecciona cuadrilla"
                  >
                    {crewList.map((crewOption, index) => (
                      <option key={crewOption.id} value={crewOption.id}>
                        Cuadrilla {index + 1} · {formatPlate(crewOption.vehiclePlate)} · {crewOption.leadTechnician.fullName}
                      </option>
                    ))}
                  </SelectField>
                  {update.isError || assign.isError ? (
                    <InlineMessage>{messageOf(update.error ?? assign.error, 'Error')}</InlineMessage>
                  ) : null}
                  <div className="wo-actions">
                    <Button onClick={() => void assignCrew()} disabled={busy || !crewId}>
                      {data.state === 'ASSIGNED' ? 'Reasignar' : 'Asignar orden'}
                    </Button>
                    <Button variant="outlined" onClick={() => void save()} disabled={busy}>
                      Guardar cambios
                    </Button>
                  </div>
                </WoCard>
              ) : (
                <WoCard title="Cuadrilla">
                  {crew ? (
                    <CrewSummary crew={crew} />
                  ) : (
                    <p className="wo-muted-line">
                      <Users aria-hidden /> Sin cuadrilla
                    </p>
                  )}
                </WoCard>
              )}

              {data.state === 'DONE' ? (
                <WoCard title="Cierre" tone="success">
                  <p className="wo-muted-line">
                    {data.closedByName ? `Cerrada por ${data.closedByName}` : 'Orden finalizada'}
                    {data.closedAt ? ` · ${formatDateTime(data.closedAt)}` : ''}
                  </p>
                  {data.closeComment ? (
                    <p className="wo-quote">{data.closeComment}</p>
                  ) : (
                    <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                      Sin comentario de cierre.
                    </p>
                  )}
                </WoCard>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}

function WoCard({
  title,
  badge,
  tone,
  accent = false,
  flush = false,
  children,
}: {
  title?: string
  badge?: string
  tone?: 'success'
  accent?: boolean
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={['wo-card', accent ? 'wo-card--accent' : '', tone ? `wo-card--${tone}` : '', flush ? 'wo-card--flush' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {title ? (
        <header className="wo-card__header">
          <h2>{title}</h2>
          {badge ? <span className="wo-card__badge">{badge}</span> : null}
        </header>
      ) : null}
      <div className="wo-card__body">{children}</div>
    </section>
  )
}

function OrderTimeline({ order }: { order: WorkOrder }) {
  const closing =
    order.state === 'CANCELLED'
      ? { tone: 'danger' as const, value: 'Cancelada', by: '' }
      : order.closedAt
        ? { tone: 'success' as const, value: formatDateTime(order.closedAt), by: order.closedByName }
        : order.state === 'IN_PROGRESS'
          ? { tone: 'caution' as const, value: 'En progreso', by: 'La cuadrilla está trabajando' }
          : { tone: 'neutral' as const, value: 'Pendiente', by: '' }
  return (
    <Timeline>
      <TimelineStep label="Creada" tone="success" value={formatDateTime(order.createdAt)} by={order.createdByName} />
      <TimelineStep
        label="Asignada"
        tone={order.assignedAt ? 'info' : 'neutral'}
        value={order.assignedAt ? formatDateTime(order.assignedAt) : 'Sin asignar'}
        by={order.assignedAt ? order.assignedByName : ''}
      />
      <TimelineStep label="Finalizada" tone={closing.tone} value={closing.value} by={closing.by} />
    </Timeline>
  )
}

function CrewSummary({ crew }: { crew: Crew }) {
  return (
    <div className="wo-crew">
      <span className="plate-tag">{formatPlate(crew.vehiclePlate)}</span>
      <div className="wo-crew__info">
        <span className="wo-crew__name">{crew.leadTechnician.fullName}</span>
        <span className="wo-crew__phone">
          <Smartphone aria-hidden /> +57 {formatPhone(crew.corporatePhone)}
        </span>
      </div>
    </div>
  )
}

function PlaceCard({ place }: { place: WorkOrderPlace | null }) {
  if (!place) {
    return (
      <WoCard title="Ubicación">
        <p className="wo-muted-line">
          <MapPin aria-hidden /> Sin ubicación (OT anterior al anclaje al mapa)
        </p>
      </WoCard>
    )
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
  const previewUrl = place.documentation ? drivePreviewUrl(place.documentation) : null
  const openDocumentation = () => {
    const href = previewUrl ?? place.documentation
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <WoCard title="Ubicación">
      <div className="wo-place">
        <span className="wo-place__icon">
          <MapPin />
        </span>
        <div className="wo-place__text">
          <div className="wo-place__name">{place.name || 'Punto del mapa'}</div>
          <div className="mono muted wo-place__coords">
            {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
          </div>
        </div>
      </div>
      <div className="wo-actions wo-actions--inline">
        <Button variant="tonal" size="sm" icon={<ExternalLink />} onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}>
          Abrir en Maps
        </Button>
        {place.documentation ? (
          <Button variant="text" size="sm" icon={<FileText />} onClick={openDocumentation}>
            Documentación
          </Button>
        ) : null}
      </div>
    </WoCard>
  )
}
