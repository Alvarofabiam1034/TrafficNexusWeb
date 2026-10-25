import { ExternalLink, FileText, MapPin, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import { useAssignWorkOrder, useUpdateWorkOrder, useWorkOrder } from '@/application/hooks/useWorkOrders'
import { messageOf } from '@/domain/errors'
import { drivePreviewUrl } from '@/domain/map/drivePreview'
import { maxPriority, type WorkOrderItemInput, type WorkOrderPlace } from '@/domain/model/workOrder'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button } from '@/presentation/components/Button'
import { TextAreaField, TextField, SelectField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime } from '@/presentation/i18n/labels'

import { WorkOrderEvidences } from './WorkOrderEvidences'
import './workOrders.css'

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

  const crew = crews.data?.find((item) => item.id === data.crewId)
  const priority = maxPriority(data.items)
  const canEdit = isAdmin && (data.state === 'DRAFT' || data.state === 'ASSIGNED')
  const busy = update.isPending || assign.isPending

  const save = async () => {
    try {
      await update.mutateAsync({
        workOrderId: data.id,
        draft: {
          externalNumber: externalNumber.trim(),
          statusReported: statusReported.trim(),
          parsedNotes: parsedNotes.trim(),
          adminNotes: adminNotes.trim(),
          items: items.filter((item) => item.externalId.trim() || item.address.trim()),
        },
      })
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
      if (canEdit) {
        await update.mutateAsync({
          workOrderId: data.id,
          draft: {
            externalNumber: externalNumber.trim(),
            statusReported: statusReported.trim(),
            parsedNotes: parsedNotes.trim(),
            adminNotes: adminNotes.trim(),
            items: items.filter((item) => item.externalId.trim() || item.address.trim()),
          },
        })
      }
      const next = await assign.mutateAsync({ workOrderId: data.id, crewId })
      toast.success(`Asignada al externo ${next.externalNumber}`)
      navigate(routes.workOrder(next.id))
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo asignar'))
    }
  }

  return (
    <>
      <PageHeader
        title={data.externalNumber ? `Externo ${data.externalNumber}` : 'Orden'}
        subtitle={
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span className={['ot-chip', data.state === 'DRAFT' ? 'ot-chip--draft' : ''].join(' ')}>
              {data.state === 'DRAFT' ? 'Borrador' : data.state === 'ASSIGNED' ? 'Asignada' : data.state}
            </span>
            {data.statusReported ? <span className="ot-chip ot-chip--status">{data.statusReported}</span> : null}
            {priority ? <span className="ot-chip ot-chip--priority">{priority}</span> : null}
          </span>
        }
        backTo={routes.workOrders}
      />
      <div className="page-body">
        <div className="ot-detail">
          <WorkOrderPlaceBlock place={data.place} />
          {canEdit ? (
            <div className="ot-form">
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <TextField
                    label="Externo"
                    value={externalNumber}
                    onChange={(event) => setExternalNumber(event.target.value)}
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <TextField
                    label="Estado reportado"
                    value={statusReported}
                    onChange={(event) => setStatusReported(event.target.value)}
                  />
                </div>
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

              {data.items.length > 0 || items.length > 0 ? (
                <div className="ot-detail__block">
                  <h2>IDs</h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ot-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Prioridad</th>
                          <th>Dirección</th>
                          <th>Equipo</th>
                          <th>Mant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={`${item.externalId}-${index}`}>
                            <td>
                              <input
                                className="ot-inline"
                                value={item.externalId}
                                onChange={(event) =>
                                  setItems((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, externalId: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="ot-inline"
                                value={item.priority}
                                onChange={(event) =>
                                  setItems((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, priority: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="ot-inline"
                                value={item.address}
                                onChange={(event) =>
                                  setItems((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, address: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="ot-inline"
                                value={item.equipment}
                                onChange={(event) =>
                                  setItems((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, equipment: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="ot-inline"
                                value={item.maintenance}
                                onChange={(event) =>
                                  setItems((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, maintenance: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <SelectField
                label={data.state === 'ASSIGNED' ? 'Reasignar cuadrilla' : 'Cuadrilla'}
                value={crewId}
                onChange={(event) => setCrewId(event.target.value)}
                placeholder="Selecciona cuadrilla"
              >
                {(crews.data ?? []).map((crewOption, index) => (
                  <option key={crewOption.id} value={crewOption.id}>
                    Cuadrilla {index + 1} · {formatPlate(crewOption.vehiclePlate)} ·{' '}
                    {crewOption.leadTechnician.fullName}
                  </option>
                ))}
              </SelectField>

              {update.isError || assign.isError ? (
                <InlineMessage>{messageOf(update.error ?? assign.error, 'Error')}</InlineMessage>
              ) : null}

              <div className="ot-form__actions">
                <Button variant="outlined" onClick={() => void save()} disabled={busy}>
                  Guardar cambios
                </Button>
                <Button onClick={() => void assignCrew()} disabled={busy || !crewId}>
                  {data.state === 'ASSIGNED' ? 'Reasignar' : 'Asignar orden'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="ot-detail__block">
                <h2>Cuadrilla</h2>
                <p className="ot-detail__text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} />
                  {crew
                    ? `${formatPlate(crew.vehiclePlate)} · ${crew.leadTechnician.fullName}`
                    : 'Sin cuadrilla'}
                </p>
                <p className="muted" style={{ fontSize: '0.8125rem' }}>
                  {data.assignedAt
                    ? `Asignada el ${formatDateTime(data.assignedAt)} por ${data.assignedByName || '—'}`
                    : `Creada el ${formatDateTime(data.createdAt)} por ${data.createdByName || '—'}`}
                </p>
              </div>

              {data.items.length > 0 ? (
                <div className="ot-detail__block">
                  <h2>IDs</h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ot-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Prioridad</th>
                          <th>Dirección</th>
                          <th>Equipo</th>
                          <th>Mant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((item) => (
                          <tr key={item.id || item.externalId + item.address}>
                            <td className="mono">{item.externalId}</td>
                            <td>{item.priority}</td>
                            <td>{item.address}</td>
                            <td>{item.equipment}</td>
                            <td>{item.maintenance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {data.parsedNotes ? (
                <div className="ot-detail__block">
                  <h2>Contexto del reporte</h2>
                  <p className="ot-detail__text">{data.parsedNotes}</p>
                </div>
              ) : null}

              {data.adminNotes ? (
                <div className="ot-detail__block">
                  <h2>Contexto adicional</h2>
                  <p className="ot-detail__text">{data.adminNotes}</p>
                </div>
              ) : null}
            </>
          )}

          {data.rawMessage ? (
            <div className="ot-detail__block">
              <h2>Mensaje original</h2>
              <pre className="ot-detail__raw">{data.rawMessage}</pre>
            </div>
          ) : null}

          <WorkOrderEvidences
            workOrderId={data.id}
            externalNumber={data.externalNumber}
            canEditCaption={isAdmin}
          />
        </div>
      </div>
    </>
  )
}

function WorkOrderPlaceBlock({ place }: { place: WorkOrderPlace | null }) {
  if (!place) {
    return (
      <div className="ot-detail__block">
        <h2>Ubicación</h2>
        <p className="ot-detail__text muted">Sin ubicación (OT anterior al anclaje al mapa)</p>
      </div>
    )
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
  const previewUrl = place.documentation ? drivePreviewUrl(place.documentation) : null
  const openDocumentation = () => {
    const href = previewUrl ?? place.documentation
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="ot-detail__block">
      <h2>Ubicación</h2>
      <div className="ot-place-banner">
        <span className="icon-badge icon-badge--hi">
          <MapPin size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ot-place-banner__title">{place.name || 'Punto del mapa'}</div>
          <div className="mono muted" style={{ fontSize: '0.75rem' }}>
            {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
          {place.documentation ? (
            <Button variant="text" size="sm" icon={<FileText />} onClick={openDocumentation}>
              Docs
            </Button>
          ) : null}
          <Button
            variant="text"
            size="sm"
            icon={<ExternalLink />}
            onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
          >
            Maps
          </Button>
        </div>
      </div>
    </div>
  )
}
