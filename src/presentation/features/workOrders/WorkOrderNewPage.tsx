import { Check, ClipboardPaste, ExternalLink, MapPin, PencilLine, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import {
  useAssignWorkOrder,
  useCreateWorkOrder,
  useParseWorkOrder,
  useUpdateWorkOrder,
} from '@/application/hooks/useWorkOrders'
import { DomainError, messageOf } from '@/domain/errors'
import type { Crew } from '@/domain/model/crew'
import {
  WORK_ORDER_INSTRUCTIONS_MAX,
  WORK_ORDER_TITLE_MAX,
  workOrderKindLabel,
  type WorkOrderItemInput,
  type WorkOrderKind,
} from '@/domain/model/workOrder'
import { isOnShiftAt } from '@/domain/schedule/scheduleRules'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { TextAreaField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { useNow } from '@/presentation/components/useNow'

import { priorityTone } from './workOrderTone'
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
  const kind = readKind(params.get('kind'))
  const placeId = params.get('placeId')?.trim() ?? ''
  const address = params.get('address')?.trim() ?? ''
  const latitude = parseCoord(params.get('lat'))
  const longitude = parseCoord(params.get('lng'))

  if (!isAdmin) return <Navigate to={routes.workOrders} replace />
  if (kind === 'REQUIREMENT') {
    if (!address || latitude === null || longitude === null) return <Navigate to={routes.externals} replace />
    return <InstructionOrderForm kind="REQUIREMENT" address={address} latitude={latitude} longitude={longitude} />
  }
  if (!placeId) return <Navigate to={routes.externals} replace />
  if (kind === 'PREVENTIVE') {
    return (
      <InstructionOrderForm
        kind="PREVENTIVE"
        placeId={placeId}
        placeName={params.get('placeName')?.trim() ?? ''}
        latitude={latitude}
        longitude={longitude}
      />
    )
  }
  return <WorkOrderNewForm placeId={placeId} />
}

function readKind(value: string | null): WorkOrderKind {
  if (value === 'PREVENTIVE' || value === 'REQUIREMENT') return value
  return 'CORRECTIVE'
}

function WorkOrderNewForm({ placeId }: { placeId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow()
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

  const fillManually = () => {
    if (items.length === 0) setItems([emptyItem()])
    setExtracted(true)
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
      toast.error(
        DomainError.hasCode(error, 'CREW_OUTSIDE_SCHEDULE')
          ? messageOf(error, 'La cuadrilla está fuera de su franja horaria; no se puede asignar ahora')
          : messageOf(error, 'No se pudo asignar la orden'),
      )
    }
  }

  const crewList = crews.data ?? []
  const selectedCrew = crewList.find((crew) => crew.id === crewId)
  const selectedOffShift = selectedCrew ? !isOnShiftAt(selectedCrew, now) : false
  const dataDone = extracted && !externalError

  return (
    <>
      <PageHeader
        title="Nueva orden"
        subtitle={placeName ? `${placeName} · pega el reporte y asigna cuadrilla` : 'Pega el reporte de WhatsApp y asígnalo'}
        backTo={routes.externals}
      />
      <div className="page-body">
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

        {crewList.length > 0 ? (
          <div className="won">
            <div className="won-main">
              <Step number={1} title="Reporte de WhatsApp" done={extracted} hint="Copia el reporte tal como llegó al chat">
                <TextAreaField
                  label="Mensaje"
                  value={rawMessage}
                  onChange={(event) => setRawMessage(event.target.value)}
                  rows={7}
                  placeholder="🔔 Cordial saludo. El externo…"
                  disabled={workOrderId !== null}
                />
                <div className="won-row">
                  <Button
                    icon={<ClipboardPaste />}
                    onClick={() => void extract()}
                    loading={parse.isPending}
                    disabled={!rawMessage.trim() || busy || workOrderId !== null}
                  >
                    Extraer datos
                  </Button>
                  {!extracted ? (
                    <Button variant="text" icon={<PencilLine />} onClick={fillManually}>
                      Llenar a mano
                    </Button>
                  ) : null}
                </div>
              </Step>

              <Step
                number={2}
                title="Datos de la orden"
                done={dataDone}
                locked={!extracted}
                hint={extracted ? 'Revisa lo extraído antes de asignar' : 'Se habilita al extraer el reporte'}
              >
                {extracted ? (
                  <>
                    <div className="won-grid-2">
                      <TextField
                        label="Externo"
                        value={externalNumber}
                        onChange={(event) => setExternalNumber(event.target.value)}
                        error={touched ? externalError : null}
                        inputMode="numeric"
                      />
                      <TextField
                        label="Estado reportado"
                        value={statusReported}
                        onChange={(event) => setStatusReported(event.target.value)}
                        placeholder="APAGADA"
                      />
                    </div>

                    <div className="won-items">
                      <div className="won-items__head">
                        <span>
                          IDs del reporte <span className="won-count">{items.length}</span>
                        </span>
                        <Button variant="text" size="sm" icon={<Plus />} onClick={() => setItems((current) => [...current, emptyItem()])}>
                          Agregar ID
                        </Button>
                      </div>
                      {items.length === 0 ? <p className="won-muted">Sin IDs. Agrega uno si el reporte los trae.</p> : null}
                      {items.map((item, index) => (
                        <div key={index} className={`won-item won-item--${priorityTone(item.priority)}`}>
                          <div className="won-item__head">
                            <span className="wo-id">{item.externalId || `#${index + 1}`}</span>
                            {item.priority ? (
                              <span className={`tone-pill tone-pill--${priorityTone(item.priority)}`}>{item.priority}</span>
                            ) : null}
                            <IconButton
                              label="Quitar ID"
                              size="sm"
                              danger
                              onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                            >
                              <Trash2 />
                            </IconButton>
                          </div>
                          <div className="won-item__fields">
                            <TextField label="ID" value={item.externalId} onChange={(event) => updateItem(index, { externalId: event.target.value })} />
                            <TextField label="Prioridad" value={item.priority} onChange={(event) => updateItem(index, { priority: event.target.value })} />
                            <TextField label="Equipo" value={item.equipment} onChange={(event) => updateItem(index, { equipment: event.target.value })} />
                            <TextField
                              label="Mantenimiento"
                              value={item.maintenance}
                              onChange={(event) => updateItem(index, { maintenance: event.target.value })}
                            />
                            <div className="won-item__wide">
                              <TextField label="Dirección" value={item.address} onChange={(event) => updateItem(index, { address: event.target.value })} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <TextAreaField
                      label="Contexto del reporte"
                      hint="Texto de actividades / novedad"
                      value={parsedNotes}
                      onChange={(event) => setParsedNotes(event.target.value)}
                      rows={4}
                    />
                    <TextAreaField
                      label="Contexto adicional"
                      hint="Notas tuyas para la cuadrilla (opcional)"
                      value={adminNotes}
                      onChange={(event) => setAdminNotes(event.target.value)}
                      rows={3}
                      placeholder="Ej. llevar módulo de repuesto, coordinar con eléctrico…"
                    />
                  </>
                ) : null}
              </Step>
            </div>

            <aside className="won-side">
              <section className="won-place">
                <span className="won-place__icon">
                  <MapPin />
                </span>
                <div className="won-place__text">
                  <span className="won-place__label">Punto del mapa</span>
                  <span className="won-place__name">{placeName || 'Punto del mapa'}</span>
                  {latitude !== null && longitude !== null ? (
                    <span className="mono muted won-place__coords">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </span>
                  ) : null}
                </div>
                {mapsUrl ? (
                  <IconButton label="Abrir en Google Maps" size="sm" onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink />
                  </IconButton>
                ) : null}
              </section>

              <Step number={3} title="Cuadrilla" done={Boolean(crewId)} locked={!extracted} compact>
                <div className="won-crews" role="radiogroup" aria-label="Cuadrilla">
                  {crewList.map((crew, index) => (
                    <CrewOption
                      key={crew.id}
                      crew={crew}
                      number={index + 1}
                      onShift={isOnShiftAt(crew, now)}
                      selected={crew.id === crewId}
                      disabled={!extracted}
                      onSelect={() => setCrewId(crew.id)}
                    />
                  ))}
                </div>
                {touched && crewError ? <p className="won-error">{crewError}</p> : null}
                {selectedOffShift ? (
                  <InlineMessage kind="info" icon={<TriangleAlert />}>
                    Según su horario, la cuadrilla está fuera de turno. Si no se puede asignar ahora, guarda la orden como borrador.
                  </InlineMessage>
                ) : null}
              </Step>

              {create.isError || update.isError || assign.isError ? (
                <InlineMessage>{messageOf(create.error ?? update.error ?? assign.error, 'No se pudo completar')}</InlineMessage>
              ) : null}

              <div className="won-actions">
                <Button onClick={() => void assignOrder()} disabled={busy || !extracted} loading={assign.isPending}>
                  Asignar orden
                </Button>
                <Button variant="outlined" onClick={() => void saveDraft()} disabled={busy || !extracted}>
                  Guardar borrador
                </Button>
                <Button variant="text" onClick={() => navigate(routes.externals)} disabled={busy}>
                  Cancelar
                </Button>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </>
  )
}

function InstructionOrderForm({
  kind,
  placeId,
  placeName,
  address,
  latitude,
  longitude,
}: {
  kind: 'PREVENTIVE' | 'REQUIREMENT'
  placeId?: string
  placeName?: string
  address?: string
  latitude: number | null
  longitude: number | null
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow()
  const crews = useCrews()
  const create = useCreateWorkOrder()
  const update = useUpdateWorkOrder()
  const assign = useAssignWorkOrder()

  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [crewId, setCrewId] = useState('')
  const [workOrderId, setWorkOrderId] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const busy = create.isPending || update.isPending || assign.isPending
  const anchorLabel = kind === 'REQUIREMENT' ? address || 'Dirección' : placeName || 'Punto del mapa'
  const mapsUrl =
    latitude !== null && longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      : null

  const titleError = !title.trim()
    ? 'Indica un título'
    : title.trim().length > WORK_ORDER_TITLE_MAX
      ? `Máximo ${WORK_ORDER_TITLE_MAX} caracteres`
      : null
  const instructionsError = !instructions.trim()
    ? 'Escribe las instrucciones'
    : instructions.trim().length > WORK_ORDER_INSTRUCTIONS_MAX
      ? `Máximo ${WORK_ORDER_INSTRUCTIONS_MAX} caracteres`
      : null
  const crewError = !crewId ? 'Selecciona una cuadrilla' : null
  const fieldsReady = !titleError && !instructionsError

  const persist = async (): Promise<string> => {
    const fields = { title: title.trim(), instructions: instructions.trim() }
    if (workOrderId) {
      await update.mutateAsync({ workOrderId, draft: { kind, externalNumber: '', statusReported: '', parsedNotes: '', adminNotes: '', items: [], ...fields } })
      return workOrderId
    }
    const created = await create.mutateAsync(
      kind === 'REQUIREMENT'
        ? { kind, address, latitude: latitude ?? undefined, longitude: longitude ?? undefined, ...fields }
        : { kind, placeId, ...fields },
    )
    setWorkOrderId(created.id)
    return created.id
  }

  const saveDraft = async () => {
    setTouched(true)
    if (!fieldsReady) return
    try {
      const id = await persist()
      toast.success('Borrador guardado')
      navigate(routes.workOrder(id))
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo guardar el borrador'))
    }
  }

  const assignOrder = async () => {
    setTouched(true)
    if (!fieldsReady || crewError) return
    try {
      const id = await persist()
      await assign.mutateAsync({ workOrderId: id, crewId })
      toast.success(`${workOrderKindLabel(kind)} asignado`)
      navigate(routes.workOrder(id))
    } catch (error) {
      toast.error(
        DomainError.hasCode(error, 'CREW_OUTSIDE_SCHEDULE')
          ? messageOf(error, 'La cuadrilla está fuera de su franja horaria; no se puede asignar ahora')
          : messageOf(error, 'No se pudo asignar la orden'),
      )
    }
  }

  const crewList = crews.data ?? []
  const selectedCrew = crewList.find((crew) => crew.id === crewId)
  const selectedOffShift = selectedCrew ? !isOnShiftAt(selectedCrew, now) : false

  return (
    <>
      <PageHeader
        title={`Nuevo ${workOrderKindLabel(kind).toLowerCase()}`}
        subtitle={`${anchorLabel} · instrucciones para la cuadrilla`}
        backTo={routes.externals}
      />
      <div className="page-body">
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
        {crewList.length > 0 ? (
          <div className="won">
            <div className="won-main">
              <Step number={1} title="Instrucciones" done={fieldsReady} hint="La cuadrilla verá este texto en el celular">
                <TextField
                  label="Título"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  error={touched ? titleError : null}
                  placeholder={kind === 'PREVENTIVE' ? 'Ej. Revisión de luminarias' : 'Ej. Señalización caída'}
                />
                <TextAreaField
                  label="Instrucciones"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={7}
                  error={touched ? instructionsError : null}
                  placeholder="Qué debe hacer la cuadrilla, con el detalle que necesite."
                />
              </Step>
            </div>
            <aside className="won-side">
              <section className="won-place">
                <span className="won-place__icon">
                  <MapPin />
                </span>
                <div className="won-place__text">
                  <span className="won-place__label">{kind === 'REQUIREMENT' ? 'Dirección' : 'Punto del mapa'}</span>
                  <span className="won-place__name">{anchorLabel}</span>
                  {latitude !== null && longitude !== null ? (
                    <span className="mono muted won-place__coords">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </span>
                  ) : null}
                </div>
                {mapsUrl ? (
                  <IconButton label="Abrir en Google Maps" size="sm" onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink />
                  </IconButton>
                ) : null}
              </section>
              <Step number={2} title="Cuadrilla" done={Boolean(crewId)} compact>
                <div className="won-crews" role="radiogroup" aria-label="Cuadrilla">
                  {crewList.map((crew, index) => (
                    <CrewOption
                      key={crew.id}
                      crew={crew}
                      number={index + 1}
                      onShift={isOnShiftAt(crew, now)}
                      selected={crew.id === crewId}
                      disabled={false}
                      onSelect={() => setCrewId(crew.id)}
                    />
                  ))}
                </div>
                {touched && crewError ? <p className="won-error">{crewError}</p> : null}
                {selectedOffShift ? (
                  <InlineMessage kind="info" icon={<TriangleAlert />}>
                    Según su horario, la cuadrilla está fuera de turno. Si no se puede asignar ahora, guarda la orden como borrador.
                  </InlineMessage>
                ) : null}
              </Step>
              {create.isError || update.isError || assign.isError ? (
                <InlineMessage>{messageOf(create.error ?? update.error ?? assign.error, 'No se pudo completar')}</InlineMessage>
              ) : null}
              <div className="won-actions">
                <Button onClick={() => void assignOrder()} disabled={busy} loading={assign.isPending}>
                  Asignar orden
                </Button>
                <Button variant="outlined" onClick={() => void saveDraft()} disabled={busy}>
                  Guardar borrador
                </Button>
                <Button variant="text" onClick={() => navigate(routes.externals)} disabled={busy}>
                  Cancelar
                </Button>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </>
  )
}

function Step({
  number,
  title,
  hint,
  done,
  locked = false,
  compact = false,
  children,
}: {
  number: number
  title: string
  hint?: string
  done: boolean
  locked?: boolean
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section className={['won-step', done ? 'is-done' : '', locked ? 'is-locked' : '', compact ? 'won-step--compact' : ''].join(' ')}>
      <header className="won-step__head">
        <span className="won-step__badge">{done ? <Check /> : number}</span>
        <div>
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
      </header>
      <div className="won-step__body">{children}</div>
    </section>
  )
}

function CrewOption({
  crew,
  number,
  onShift,
  selected,
  disabled,
  onSelect,
}: {
  crew: Crew
  number: number
  onShift: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={`won-crew${selected ? ' is-selected' : ''}${onShift ? ' is-on' : ''}`}
      onClick={onSelect}
    >
      <span className="won-crew__radio" aria-hidden />
      <span className="won-crew__text">
        <span className="won-crew__top">
          <strong>Cuadrilla {number}</strong>
          <span className="plate-tag">{formatPlate(crew.vehiclePlate)}</span>
        </span>
        <span className="won-crew__lead">{crew.leadTechnician.fullName}</span>
      </span>
      <span className={`tone-pill tone-pill--${onShift ? 'success' : 'neutral'}`}>{onShift ? 'En turno' : 'Fuera de turno'}</span>
    </button>
  )
}
