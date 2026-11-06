import {
  ChevronRight,
  ClipboardList,
  ClipboardPlus,
  ExternalLink,
  FileText,
  FileUp,
  History,
  Layers,
  MapPin,
  Route,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

import { useContainer, useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import { useImportMap, useLatestMap, useMapVersion, useMapVersions } from '@/application/hooks/useMap'
import { useWorkOrders } from '@/application/hooks/useWorkOrders'
import type { Crew } from '@/domain/model/crew'
import { messageOf } from '@/domain/errors'
import { drivePreviewUrl } from '@/domain/map/drivePreview'
import { ACTIVE_STATES, activeStateOf, isActiveOrder, ordersByPlace } from '@/domain/map/placeOrders'
import { workfronts, type Workfront } from '@/domain/map/workfronts'
import { EMPTY_MAP, type MapPlace, type StoredMap } from '@/domain/model/map'
import {
  externalNumberFromPlaceName,
  maxPriority,
  workOrderStateLabel,
  type WorkOrder,
  type WorkOrderState,
} from '@/domain/model/workOrder'
import { formatPlate } from '@/domain/validation/crewValidator'
import type { LayerPreferences } from '@/domain/repository'
import { parseKmlFile } from '@/infrastructure/kml/kmlParser'
import type { MapCameraTarget } from '@/infrastructure/maps/googleMaps'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Switch } from '@/presentation/components/Switch'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import { priorityTone, STATE_TONE } from '../workOrders/workOrderTone'
import { GoogleMapView } from './GoogleMapView'
import './externals.css'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const WIDE_SCREEN = '(min-width: 900px)'

const STATE_MARKER_COLOR: Partial<Record<WorkOrderState, string>> = {
  IN_PROGRESS: '#FFC928',
  ASSIGNED: '#64B5F6',
  DRAFT: '#9AA5B4',
}

type TrackingFilter = 'ALL' | WorkOrderState

export default function ExternalsPage() {
  const latest = useLatestMap()
  const [versionId, setVersionId] = useState<string | null>(null)
  const version = useMapVersion(versionId)

  const map: StoredMap = versionId ? (version.data ?? EMPTY_MAP) : (latest.data ?? EMPTY_MAP)
  const loading = latest.isPending || (versionId !== null && version.isPending)

  if (latest.isError) {
    return (
      <div className="externals">
        <ErrorState message="No se pudo cargar el mapa del proyecto." onRetry={() => void latest.refetch()} />
      </div>
    )
  }

  return (
    <ExternalsMap
      map={map}
      loading={loading}
      viewingVersionId={versionId}
      onSelectVersion={setVersionId}
      currentVersion={latest.data ?? null}
    />
  )
}

function ExternalsMap({
  map,
  loading,
  viewingVersionId,
  onSelectVersion,
  currentVersion,
}: {
  map: StoredMap
  loading: boolean
  viewingVersionId: string | null
  onSelectVersion: (versionId: string | null) => void
  currentVersion: StoredMap | null
}) {
  const isAdmin = useIsAdmin()
  const toast = useToast()
  const { preferences } = useContainer()
  const importMap = useImportMap()
  const fileRef = useRef<HTMLInputElement>(null)

  const [layers, setLayers] = useState<LayerPreferences>(() => preferences.layers())
  const [query, setQuery] = useState('')
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [workfront, setWorkfront] = useState<number | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [target, setTarget] = useState<MapCameraTarget | null>(null)
  const [trackingOpen, setTrackingOpen] = useState(() => window.matchMedia(WIDE_SCREEN).matches)
  const orders = useWorkOrders()
  const crews = useCrews()

  useEffect(() => preferences.saveLayers(layers), [layers, preferences])

  const crewById = useMemo(() => new Map((crews.data ?? []).map((crew) => [crew.id, crew])), [crews.data])
  const placeOrders = useMemo(() => ordersByPlace(map.places, orders.data ?? []), [map.places, orders.data])
  const placeColors = useMemo(() => {
    const colors = new Map<string, string>()
    for (const [placeId, list] of placeOrders) {
      const state = activeStateOf(list)
      const color = state ? STATE_MARKER_COLOR[state] : undefined
      if (color) colors.set(placeId, color)
    }
    return colors
  }, [placeOrders])
  const placeIdByOrder = useMemo(() => {
    const index = new Map<string, string>()
    for (const [placeId, list] of placeOrders) for (const order of list) index.set(order.id, placeId)
    return index
  }, [placeOrders])
  const activeOrders = useMemo(() => (orders.data ?? []).filter(isActiveOrder), [orders.data])

  // Al cambiar el mapa (otra versión o importación) la selección deja de tener sentido.
  const [shownMap, setShownMap] = useState(map)
  if (shownMap !== map) {
    setShownMap(map)
    setSelectedPlaceId(null)
    setWorkfront(null)
  }

  const fronts = useMemo(() => workfronts(map.places, map.lines), [map])
  const activeFront: Workfront | null = fronts.find((front) => front.number === workfront) ?? null

  const visiblePlaces = useMemo(
    () => (activeFront ? map.places.filter((place) => activeFront.placeIds.has(place.id)) : map.places),
    [map.places, activeFront],
  )
  const visibleLines = useMemo(
    () => (activeFront ? map.lines.filter((line) => activeFront.lineIds.has(line.id)) : map.lines),
    [map.lines, activeFront],
  )

  const results = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (text.length < 2) return []
    return map.places.filter((place) => place.name.toLowerCase().includes(text)).slice(0, 8)
  }, [query, map.places])

  const selectedPlace = map.places.find((place) => place.id === selectedPlaceId) ?? null

  const selectPlace = (placeId: string) => {
    setSelectedPlaceId(placeId)
    if (!window.matchMedia(WIDE_SCREEN).matches) setTrackingOpen(false)
  }

  const focusPlace = (place: MapPlace) => {
    selectPlace(place.id)
    setQuery('')
    setTarget((prev) => ({
      key: (prev?.key ?? 0) + 1,
      kind: 'center',
      center: { lat: place.latitude, lng: place.longitude },
      zoom: 16,
    }))
  }

  const focusAll = (places: readonly MapPlace[], lines: typeof map.lines) => {
    const points = [
      ...places.map((place) => ({ lat: place.latitude, lng: place.longitude })),
      ...lines.flatMap((line) => line.points.map((point) => ({ lat: point.latitude, lng: point.longitude }))),
    ]
    if (points.length === 0) return
    setTarget((prev) => ({ key: (prev?.key ?? 0) + 1, kind: 'bounds', points }))
  }

  const chooseFront = (number: number | null) => {
    setWorkfront(number)
    setSelectedPlaceId(null)
    const front = fronts.find((item) => item.number === number)
    if (front) {
      focusAll(
        map.places.filter((place) => front.placeIds.has(place.id)),
        map.lines.filter((line) => front.lineIds.has(line.id)),
      )
    } else {
      focusAll(map.places, map.lines)
    }
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) return toast.error('El archivo supera los 25 MB')
    setImporting(true)
    try {
      const parsed = await parseKmlFile(file)
      if (parsed.places.length === 0 && parsed.lines.length === 0) {
        toast.error('El archivo no tiene puntos ni trazos')
        return
      }
      await importMap.mutateAsync(parsed)
      onSelectVersion(null)
      toast.success(
        `Mapa actualizado: ${plural(parsed.places.length, 'punto', 'puntos')} y ${plural(parsed.lines.length, 'trazo', 'trazos')}`,
      )
      focusAll(parsed.places, parsed.lines)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo leer el archivo KML/KMZ'))
    } finally {
      setImporting(false)
    }
  }

  const isEmpty = !loading && map.places.length === 0 && map.lines.length === 0

  return (
    <div className="externals">
      <GoogleMapView
        places={visiblePlaces}
        lines={visibleLines}
        pointsVisible={layers.pointsVisible}
        linesVisible={layers.linesVisible}
        selectedPlaceId={selectedPlaceId}
        target={target}
        onSelectPlace={selectPlace}
        placeColors={placeColors}
      />

      <div className="externals__top">
        <div className="externals__search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar punto…"
            aria-label="Buscar punto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <IconButton label="Limpiar" size="sm" onClick={() => setQuery('')}>
              <X />
            </IconButton>
          ) : null}
          {results.length > 0 ? (
            <ul className="externals__results" role="listbox">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={place.id === selectedPlaceId}
                    onClick={() => focusPlace(place)}
                  >
                    <MapPin size={16} />
                    <span>{place.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="externals__actions">
          <button
            type="button"
            className={`externals__tracking-toggle${trackingOpen ? ' is-on' : ''}`}
            aria-pressed={trackingOpen}
            onClick={() => setTrackingOpen((value) => !value)}
          >
            <ClipboardList />
            <span>Seguimiento</span>
            {activeOrders.length > 0 ? <span className="externals__count">{activeOrders.length}</span> : null}
          </button>
          <IconButton label="Capas" onClick={() => setLayersOpen(true)}>
            <Layers />
          </IconButton>
          <IconButton label="Versiones del mapa" onClick={() => setVersionsOpen(true)}>
            <History />
          </IconButton>
          {isAdmin ? (
            <IconButton label="Cargar KML/KMZ" accent disabled={importing} onClick={() => fileRef.current?.click()}>
              <FileUp />
            </IconButton>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            hidden
            onChange={(event) => void onFile(event)}
          />
        </div>
      </div>

      {fronts.length > 0 ? (
        <div className="externals__fronts chip-row">
          <button
            type="button"
            className={['chip', workfront === null ? 'chip--selected' : ''].join(' ')}
            onClick={() => chooseFront(null)}
          >
            Todos
          </button>
          {fronts.map((front) => (
            <button
              key={front.number}
              type="button"
              className={['chip', workfront === front.number ? 'chip--selected' : ''].join(' ')}
              onClick={() => chooseFront(front.number)}
            >
              <Route size={14} /> WF{front.number}
            </button>
          ))}
        </div>
      ) : null}

      {viewingVersionId ? (
        <div className="externals__banner">
          <History size={16} /> Viendo una versión anterior
          <Button variant="text" size="sm" onClick={() => onSelectVersion(null)}>
            Volver a la actual
          </Button>
        </div>
      ) : null}

      {loading || importing ? (
        <div className="externals__overlay">
          <Loading label={importing ? 'Importando mapa…' : 'Cargando mapa…'} />
        </div>
      ) : null}

      {isEmpty ? (
        <div className="externals__empty card">
          <MapPin size={28} color="var(--brand-accent)" />
          <h3>Sin mapa cargado</h3>
          <p className="muted">
            {isAdmin
              ? 'Carga un archivo KML o KMZ con los puntos y trazos de los frentes de trabajo (WF1, WF2…).'
              : 'El administrador aún no ha cargado el mapa del proyecto.'}
          </p>
          {isAdmin ? (
            <Button icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              Cargar KML/KMZ
            </Button>
          ) : null}
        </div>
      ) : null}

      {trackingOpen ? (
        <TrackingPanel
          orders={activeOrders}
          loading={orders.isPending}
          crewById={crewById}
          belowFronts={fronts.length > 0}
          selectedPlaceId={selectedPlaceId}
          placeIdOf={(order) => placeIdByOrder.get(order.id) ?? null}
          onFocus={(placeId) => {
            const place = map.places.find((item) => item.id === placeId)
            if (place) focusPlace(place)
          }}
          onClose={() => setTrackingOpen(false)}
        />
      ) : null}

      {selectedPlace ? (
        <PlaceCard
          place={selectedPlace}
          orders={placeOrders.get(selectedPlace.id) ?? []}
          crewById={crewById}
          onClose={() => setSelectedPlaceId(null)}
        />
      ) : null}

      <Dialog open={layersOpen} onClose={() => setLayersOpen(false)} title="Capas" icon={<Layers />}>
        <div className="stack">
          <label className="row externals__layer">
            <span>
              <MapPin size={18} /> Puntos
            </span>
            <Switch
              checked={layers.pointsVisible}
              onChange={(pointsVisible) => setLayers({ ...layers, pointsVisible })}
              label="Mostrar puntos"
            />
          </label>
          <label className="row externals__layer">
            <span>
              <Route size={18} /> Trazos
            </span>
            <Switch
              checked={layers.linesVisible}
              onChange={(linesVisible) => setLayers({ ...layers, linesVisible })}
              label="Mostrar trazos"
            />
          </label>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>
            {plural(map.places.length, 'punto', 'puntos')} · {plural(map.lines.length, 'trazo', 'trazos')} ·{' '}
            {plural(fronts.length, 'frente', 'frentes')}
          </p>
        </div>
      </Dialog>

      <VersionsDialog
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        viewingVersionId={viewingVersionId}
        hasCurrent={currentVersion !== null}
        onSelect={(id) => {
          onSelectVersion(id)
          setVersionsOpen(false)
        }}
      />
    </div>
  )
}

const TRACKING_FILTERS: readonly { key: TrackingFilter; label: string }[] = [
  { key: 'ALL', label: 'Activas' },
  { key: 'IN_PROGRESS', label: 'En progreso' },
  { key: 'ASSIGNED', label: 'Asignadas' },
  { key: 'DRAFT', label: 'Borradores' },
]

function TrackingPanel({
  orders,
  loading,
  crewById,
  belowFronts,
  selectedPlaceId,
  placeIdOf,
  onFocus,
  onClose,
}: {
  orders: readonly WorkOrder[]
  loading: boolean
  crewById: ReadonlyMap<string, Crew>
  belowFronts: boolean
  selectedPlaceId: string | null
  placeIdOf: (order: WorkOrder) => string | null
  onFocus: (placeId: string) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TrackingFilter>('ALL')
  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          ACTIVE_STATES.indexOf(a.state) - ACTIVE_STATES.indexOf(b.state) ||
          (b.assignedAt ?? b.createdAt).localeCompare(a.assignedAt ?? a.createdAt),
      ),
    [orders],
  )
  const visible = filter === 'ALL' ? sorted : sorted.filter((order) => order.state === filter)

  return (
    <aside className={`externals__tracking${belowFronts ? ' externals__tracking--low' : ''}`} aria-label="Seguimiento de OTs">
      <header className="externals__tracking-head">
        <div>
          <h2>Seguimiento de OTs</h2>
          <span>{plural(orders.length, 'orden abierta', 'órdenes abiertas')}</span>
        </div>
        <IconButton label="Cerrar seguimiento" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </header>

      <div className="externals__tracking-tabs" role="tablist">
        {TRACKING_FILTERS.map((item) => {
          const count = item.key === 'ALL' ? orders.length : orders.filter((order) => order.state === item.key).length
          const tone = item.key === 'ALL' ? 'accent' : STATE_TONE[item.key]
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`externals__tab externals__tab--${tone}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="externals__tracking-list">
        {loading ? <Loading /> : null}
        {!loading && visible.length === 0 ? (
          <p className="externals__tracking-empty">
            {orders.length === 0 ? 'No hay órdenes abiertas. Selecciona un punto para asignar una OT.' : 'No hay órdenes en este estado.'}
          </p>
        ) : null}
        {visible.map((order) => {
          const placeId = placeIdOf(order)
          const crew = order.crewId ? crewById.get(order.crewId) : undefined
          const tone = STATE_TONE[order.state]
          const priority = maxPriority(order.items)
          return (
            <div
              key={order.id}
              className={`externals__ot externals__ot--${tone}${placeId && placeId === selectedPlaceId ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className="externals__ot-main"
                disabled={!placeId}
                title={placeId ? 'Ver en el mapa' : 'El punto no está en el mapa actual'}
                onClick={() => placeId && onFocus(placeId)}
              >
                <span className="externals__ot-top">
                  <span className="externals__ot-number">{order.externalNumber || '—'}</span>
                  <span className={`tone-pill tone-pill--dot tone-pill--${tone}`}>{workOrderStateLabel(order.state)}</span>
                  {priority ? <span className={`tone-pill tone-pill--${priorityTone(priority)}`}>{priority}</span> : null}
                </span>
                <span className="externals__ot-place">
                  <MapPin aria-hidden />
                  {order.place?.name || 'Sin ubicación'}
                </span>
                <span className="externals__ot-meta">
                  {crew ? <span className="plate-tag">{formatPlate(crew.vehiclePlate)}</span> : <span>Sin cuadrilla</span>}
                  <span>{formatDateTime(order.assignedAt ?? order.createdAt)}</span>
                </span>
              </button>
              <IconButton label={`Abrir OT ${order.externalNumber}`} size="sm" onClick={() => navigate(routes.workOrder(order.id))}>
                <ChevronRight />
              </IconButton>
            </div>
          )
        })}
      </div>

      <footer className="externals__legend">
        <span style={{ '--dot': STATE_MARKER_COLOR.IN_PROGRESS } as CSSProperties}>En progreso</span>
        <span style={{ '--dot': STATE_MARKER_COLOR.ASSIGNED } as CSSProperties}>Asignada</span>
        <span style={{ '--dot': STATE_MARKER_COLOR.DRAFT } as CSSProperties}>Borrador</span>
        <span style={{ '--dot': '#00D6A0' } as CSSProperties}>Sin OT abierta</span>
      </footer>
    </aside>
  )
}

const PLACE_HISTORY_LIMIT = 5

function PlaceCard({
  place,
  orders,
  crewById,
  onClose,
}: {
  place: MapPlace
  orders: readonly WorkOrder[]
  crewById: ReadonlyMap<string, Crew>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const activeState = activeStateOf(orders)
  const shownOrders = orders.slice(0, PLACE_HISTORY_LIMIT)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
  const previewUrl = place.documentation ? drivePreviewUrl(place.documentation) : null
  const externalNumber = externalNumberFromPlaceName(place.name)
  const openDocumentation = () => {
    const href = previewUrl ?? place.documentation
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
  }
  const assignOt = () => {
    const params = new URLSearchParams({ placeId: place.id })
    if (externalNumber) params.set('external', externalNumber)
    if (place.name.trim()) params.set('placeName', place.name.trim())
    params.set('lat', String(place.latitude))
    params.set('lng', String(place.longitude))
    navigate(`${routes.workOrderNew}?${params.toString()}`)
  }

  const tone = activeState ? STATE_TONE[activeState] : 'accent'

  return (
    <aside className={`externals__place externals__place--${tone}`} aria-label={`Detalle de ${place.name}`}>
      <div className="externals__place-head">
        <span className="externals__place-icon">
          <MapPin />
        </span>
        <div className="externals__place-title">
          <h3>{place.name || 'Sin nombre'}</h3>
          <span className="mono muted" style={{ fontSize: '0.75rem' }}>
            {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
          </span>
        </div>
        <IconButton label="Cerrar" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="externals__place-status">
        {activeState ? (
          <span className={`tone-pill tone-pill--dot tone-pill--${tone}`}>OT {workOrderStateLabel(activeState).toLowerCase()}</span>
        ) : (
          <span className="tone-pill tone-pill--accent">Sin OT abierta</span>
        )}
        {externalNumber ? <span className="tone-pill tone-pill--neutral">Externo {externalNumber}</span> : null}
      </div>

      {place.description ? <p className="externals__place-text">{place.description}</p> : null}

      <div className="externals__history">
        <span className="externals__history-title">
          Órdenes del punto <span>{orders.length}</span>
        </span>
        {orders.length === 0 ? (
          <p className="externals__history-empty">Este punto aún no tiene órdenes.</p>
        ) : (
          <ul>
            {shownOrders.map((order) => {
              const crew = order.crewId ? crewById.get(order.crewId) : undefined
              const orderTone = STATE_TONE[order.state]
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    className={`externals__history-row externals__history-row--${orderTone}`}
                    onClick={() => navigate(routes.workOrder(order.id))}
                  >
                    <span className={`tone-pill tone-pill--dot tone-pill--${orderTone}`}>{workOrderStateLabel(order.state)}</span>
                    <span className="externals__history-when">{formatDateTime(order.closedAt ?? order.assignedAt ?? order.createdAt)}</span>
                    {crew ? <span className="plate-tag">{formatPlate(crew.vehiclePlate)}</span> : null}
                    <ChevronRight aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {orders.length > shownOrders.length ? (
          <span className="externals__history-more">y {orders.length - shownOrders.length} más</span>
        ) : null}
      </div>

      <div className="externals__place-actions">
        {isAdmin ? (
          <Button icon={<ClipboardPlus />} onClick={assignOt}>
            Asignar OT
          </Button>
        ) : null}
        <Button variant="tonal" size="sm" icon={<ExternalLink />} onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}>
          Maps
        </Button>
        {place.documentation ? (
          <Button variant="text" size="sm" icon={<FileText />} onClick={openDocumentation}>
            Documentación
          </Button>
        ) : null}
      </div>
    </aside>
  )
}

function VersionsDialog({
  open,
  onClose,
  viewingVersionId,
  hasCurrent,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  viewingVersionId: string | null
  hasCurrent: boolean
  onSelect: (versionId: string | null) => void
}) {
  const versions = useMapVersions(open)
  return (
    <Dialog open={open} onClose={onClose} title="Versiones del mapa" icon={<History />}>
      {versions.isPending && open ? <Loading /> : null}
      {versions.isError ? <InlineMessage>No se pudieron cargar las versiones.</InlineMessage> : null}
      {versions.data && versions.data.length === 0 ? (
        <p className="dialog__text">{hasCurrent ? 'Solo existe la versión actual.' : 'Aún no se ha cargado ningún mapa.'}</p>
      ) : null}
      {versions.data && versions.data.length > 0 ? (
        <div className="stack" style={{ gap: 4 }}>
          {versions.data.map((version, index) => {
            const isLatest = index === 0
            const active = isLatest ? viewingVersionId === null : viewingVersionId === version.id
            return (
              <button
                key={version.id}
                type="button"
                className={['list-row', 'externals__version', active ? 'externals__version--active' : ''].join(' ')}
                onClick={() => onSelect(isLatest ? null : version.id)}
              >
                <span className="icon-badge">
                  <History />
                </span>
                <span className="list-row__main">
                  <span className="list-row__title">
                    Versión {version.versionNumber}
                    {isLatest ? (
                      <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                        Actual
                      </span>
                    ) : null}
                  </span>
                  <span className="list-row__sub">
                    {version.createdByName || 'Sistema'} · {formatDateTime(version.createdAt)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </Dialog>
  )
}
