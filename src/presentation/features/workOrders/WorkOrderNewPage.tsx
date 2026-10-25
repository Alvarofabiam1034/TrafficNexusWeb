import { ClipboardPaste, ExternalLink, MapPin, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import {
  useAssignWorkOrder,
  useCreateWorkOrder,
  useParseWorkOrder,
  useUpdateWorkOrder,
} from '@/application/hooks/useWorkOrders'
import { messageOf } from '@/domain/errors'
import type { WorkOrderItemInput } from '@/domain/model/workOrder'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { TextAreaField, TextField, SelectField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'

import './workOrders.css'

const emptyItem = (): WorkOrderItemInput => ({
  externalId: '',
  priority: '',
  address: '',
  equipment: '',
  maintenance: '',
})

function parseCoord(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function WorkOrderNewPage() {
  const isAdmin = useIsAdmin()
  const [params] = useSearchParams()
  const placeId = params.get('placeId')?.trim() ?? ''

  if (!isAdmin) return <Navigate to={routes.workOrders} replace />
  if (!placeId) return <Navigate to={routes.externals} replace />
  return <WorkOrderNewForm placeId={placeId} />
}

function WorkOrderNewForm({ placeId }: { placeId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const presetExternal = params.get('external')?.trim() ?? ''
  const placeName = params.get('placeName')?.trim() ?? ''
  const latitude = parseCoord(params.get('lat'))
  const longitude = parseCoord(params.get('lng'))
  const mapsUrl =
    latitude !== null && longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      : null

  const crews = useCrews()
  const parse = useParseWorkOrder()
  const create = useCreateWorkOrder()
  const update = useUpdateWorkOrder()
  const assign = useAssignWorkOrder()

  const [rawMessage, setRawMessage] = useState('')
  const [externalNumber, setExternalNumber] = useState(presetExternal)
  const [statusReported, setStatusReported] = useState('')
  const [parsedNotes, setParsedNotes] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [items, setItems] = useState<WorkOrderItemInput[]>([])
  const [crewId, setCrewId] = useState('')
  const [workOrderId, setWorkOrderId] = useState<string | null>(null)
  const [extracted, setExtracted] = useState(Boolean(presetExternal))
  const [touched, setTouched] = useState(false)

  const busy = parse.isPending || create.isPending || update.isPending || assign.isPending

  const itemInputs = useMemo(
    () => items.filter((item) => item.externalId.trim() || item.address.trim()),
    [items],
  )

  const extract = async () => {
    try {
      const draft = await parse.mutateAsync(rawMessage)
      setExternalNumber(draft.externalNumber || presetExternal)
      setStatusReported(draft.statusReported)
      setParsedNotes(draft.parsedNotes)
      setItems(
        draft.items.length > 0
          ? draft.items.map((item) => ({
              externalId: item.externalId,
              priority: item.priority,
              address: item.address,
              equipment: item.equipment,
              maintenance: item.maintenance,
            }))
          : [emptyItem()],
      )
      setExtracted(true)
      toast.success('Datos extraídos')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo analizar el mensaje'))
    }
  }

  const updateItem = (index: number, patch: Partial<WorkOrderItemInput>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const formDraft = () => ({
    externalNumber: externalNumber.trim(),
    statusReported: statusReported.trim(),
    parsedNotes: parsedNotes.trim(),
    adminNotes: adminNotes.trim(),
    items: itemInputs,
  })

  const externalError = !externalNumber.trim() ? 'Indica el número de externo' : null
  const crewError = !crewId ? 'Selecciona una cuadrilla' : null

  const persistDraft = async (): Promise<string> => {
    const fields = formDraft()
    if (workOrderId) {
      await update.mutateAsync({ workOrderId, draft: fields })
      return workOrderId
    }
    const created = await create.mutateAsync({
      placeId,
      rawMessage: rawMessage.trim() || `Externo ${fields.externalNumber}`,
      ...fields,
    })
    setWorkOrderId(created.id)
    return created.id
  }

  const saveDraft = async () => {
    setTouched(true)
    if (externalError) return
    try {
      const id = await persistDraft()
      toast.success('Borrador guardado')
      navigate(routes.workOrder(id))
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo guardar el borrador'))
    }
  }

  const assignOrder = async () => {
    setTouched(true)
    if (externalError || crewError) return
    try {
      const id = await persistDraft()
      const order = await assign.mutateAsync({ workOrderId: id, crewId })
      toast.success(`OT del externo ${order.externalNumber} asignada`)
      navigate(routes.workOrder(order.id))
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo asignar la orden'))
    }
  }

  return (
    <>
      <PageHeader
        title="Nueva orden"
        subtitle={
          placeName
            ? `${placeName} · pega el reporte y asigna cuadrilla`
            : presetExternal
              ? `Externo ${presetExternal} · pega el reporte y asigna cuadrilla`
              : 'Pega el reporte de WhatsApp y asígnalo'
        }
        backTo={routes.externals}
      />
      <div className="page-body">
        <div className="ot-place-banner">
          <span className="icon-badge icon-badge--hi">
            <MapPin size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ot-place-banner__title">{placeName || 'Punto del mapa'}</div>
            {latitude !== null && longitude !== null ? (
              <div className="mono muted" style={{ fontSize: '0.75rem' }}>
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                Anclada al place del mapa vigente
              </div>
            )}
          </div>
          {mapsUrl ? (
            <Button
              variant="text"
              size="sm"
              icon={<ExternalLink />}
              onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
            >
              Maps
            </Button>
          ) : null}
        </div>

        {crews.isPending ? <Loading /> : null}
        {crews.data && crews.data.length === 0 ? (
          <EmptyState
            icon={<Plus />}
            title="No hay cuadrillas"
            body="Crea una cuadrilla antes de asignar órdenes de trabajo."
            action={
              <Button variant="outlined" onClick={() => navigate(routes.crews)}>
                Ir a cuadrillas
              </Button>
            }
          />
        ) : null}

        {crews.data && crews.data.length > 0 ? (
          <div className="ot-form">
            <TextAreaField
              label="Mensaje de WhatsApp"
              hint="Copia el reporte tal como llegó al chat"
              value={rawMessage}
              onChange={(event) => setRawMessage(event.target.value)}
              rows={8}
              placeholder="🔔 Cordial saludo. El externo…"
              disabled={workOrderId !== null}
            />
            <div className="ot-form__actions" style={{ justifyContent: 'flex-start' }}>
              <Button
                variant="outlined"
                icon={<ClipboardPaste />}
                onClick={() => void extract()}
                disabled={!rawMessage.trim() || busy || workOrderId !== null}
              >
                Extraer datos
              </Button>
            </div>

            {extracted ? (
              <>
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 140px' }}>
                    <TextField
                      label="Externo"
                      value={externalNumber}
                      onChange={(event) => setExternalNumber(event.target.value)}
                      error={touched ? externalError : null}
                      inputMode="numeric"
                    />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <TextField
                      label="Estado reportado"
                      value={statusReported}
                      onChange={(event) => setStatusReported(event.target.value)}
                      placeholder="APAGADA"
                    />
                  </div>
                </div>

                <div className="ot-items">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="label">IDs del reporte</span>
                    <Button
                      variant="text"
                      size="sm"
                      icon={<Plus />}
                      onClick={() => setItems((current) => [...current, emptyItem()])}
                    >
                      Agregar ID
                    </Button>
                  </div>
                  {items.map((item, index) => (
                    <div key={index} className="ot-item">
                      <div className="ot-item__head ot-item__wide">
                        <strong>ID {item.externalId || index + 1}</strong>
                        <IconButton
                          label="Quitar ID"
                          size="sm"
                          onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                      <TextField
                        label="ID"
                        value={item.externalId}
                        onChange={(event) => updateItem(index, { externalId: event.target.value })}
                      />
                      <TextField
                        label="Prioridad"
                        value={item.priority}
                        onChange={(event) => updateItem(index, { priority: event.target.value })}
                      />
                      <TextField
                        label="Equipo"
                        value={item.equipment}
                        onChange={(event) => updateItem(index, { equipment: event.target.value })}
                      />
                      <div className="ot-item__wide">
                        <TextField
                          label="Dirección"
                          value={item.address}
                          onChange={(event) => updateItem(index, { address: event.target.value })}
                        />
                      </div>
                      <TextField
                        label="Mantenimiento"
                        value={item.maintenance}
                        onChange={(event) => updateItem(index, { maintenance: event.target.value })}
                      />
                    </div>
                  ))}
                </div>

                <TextAreaField
                  label="Contexto del reporte"
                  hint="Texto de actividades / novedad"
                  value={parsedNotes}
                  onChange={(event) => setParsedNotes(event.target.value)}
                  rows={5}
                />
                <TextAreaField
                  label="Contexto adicional"
                  hint="Notas tuyas para la cuadrilla (opcional)"
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  rows={3}
                  placeholder="Ej. llevar módulo de repuesto, coordinar con eléctrico…"
                />

                <SelectField
                  label="Cuadrilla"
                  value={crewId}
                  onChange={(event) => setCrewId(event.target.value)}
                  error={touched ? crewError : null}
                  placeholder="Selecciona cuadrilla"
                >
                  {crews.data.map((crew, index) => (
                    <option key={crew.id} value={crew.id}>
                      Cuadrilla {index + 1} · {formatPlate(crew.vehiclePlate)} · {crew.leadTechnician.fullName}
                    </option>
                  ))}
                </SelectField>

                {create.isError || update.isError || assign.isError ? (
                  <InlineMessage>
                    {messageOf(create.error ?? update.error ?? assign.error, 'No se pudo completar')}
                  </InlineMessage>
                ) : null}

                <div className="ot-form__actions">
                  <Button variant="text" onClick={() => navigate(routes.externals)} disabled={busy}>
                    Cancelar
                  </Button>
                  <Button variant="outlined" onClick={() => void saveDraft()} disabled={busy}>
                    Guardar borrador
                  </Button>
                  <Button onClick={() => void assignOrder()} disabled={busy}>
                    Asignar orden
                  </Button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Pega el mensaje y pulsa <strong>Extraer datos</strong> para revisar el borrador antes de
                asignar.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}
