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
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

import { useContainer, useIsAdmin } from '@/application/ContainerContext'
import { useCrewLocations, useCrews } from '@/application/hooks/useCrews'
import { useImportMap, useLatestMap, useMapVersion, useMapVersions } from '@/application/hooks/useMap'
import { useWorkOrders } from '@/application/hooks/useWorkOrders'
import type { Crew } from '@/domain/model/crew'
import { crewFixAgeLabel, isCrewFixStale, type CrewLocation } from '@/domain/model/crewLocation'
import { messageOf } from '@/domain/errors'
import { drivePreviewUrl } from '@/domain/map/drivePreview'
import { ACTIVE_STATES, activeStateOf, isActiveOrder, ordersByPlace } from '@/domain/map/placeOrders'
import { workfrontColor, workfronts, type Workfront } from '@/domain/map/workfronts'
import { EMPTY_MAP, type MapPlace, type StoredMap } from '@/domain/model/map'
import {
  externalNumberFromPlaceName,
  isInstructionKind,
  maxPriority,
  workOrderKindLabel,
  workOrderStateLabel,
  type WorkOrder,
  type WorkOrderState,
} from '@/domain/model/workOrder'
import { formatPhone, formatPlate } from '@/domain/validation/crewValidator'
import type { LayerPreferences } from '@/domain/repository'
import { parseKmlFile } from '@/infrastructure/kml/kmlParser'
import {
  loadPlacesLibrary,
  newAddressSession,
  resolveAddress,
  suggestAddresses,
  type AddressSuggestion,
  type MapCameraTarget,
  type ResolvedAddress,
} from '@/infrastructure/maps/googleMaps'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Switch } from '@/presentation/components/Switch'
import { useToast } from '@/presentation/components/Toast'
import { useNow } from '@/presentation/components/useNow'
import { formatDateTime, plural, roleLabel } from '@/presentation/i18n/labels'

import { priorityTone, STATE_TONE } from '../workOrders/workOrderTone'
import { GoogleMapView, type CrewMapPin, type RequirementMapPin } from './GoogleMapView'
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
  const [trackingOpen, setTrackingOpen] = useState(false)
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null)
  const [assignPlace, setAssignPlace] = useState<MapPlace | null>(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressHits, setAddressHits] = useState<AddressSuggestion[]>([])
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressPick, setAddressPick] = useState<ResolvedAddress | null>(null)
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null)
  const addressSession = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const navigate = useNavigate()
  const [fitToken, setFitToken] = useState(0)
  const [fittedToken, setFittedToken] = useState(0)
  const orders = useWorkOrders()
  const crews = useCrews()
  const now = useNow()
  const crewLocations = useCrewLocations(isAdmin && layers.crewsVisible)

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
  const locatedCrews = useMemo(
    () => (crewLocations.data ?? []).filter((crew) => crew.location !== null),
    [crewLocations.data],
  )
  const crewPins = useMemo(() => {
    const nowMs = now.getTime()
    const pins: CrewMapPin[] = []
    for (const crew of locatedCrews) {
      const fix = crew.location
      if (!fix) continue
      pins.push({
        id: crew.crewId,
        label: formatPlate(crew.plate),
        title: `${crew.lead.fullName} · ${formatPlate(crew.plate)}`,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: fix.accuracyMeters,
        stale: isCrewFixStale(fix.receivedAt, nowMs),
      })
    }
    return pins
  }, [locatedCrews, now])
  const selectedCrew = locatedCrews.find((crew) => crew.crewId === selectedCrewId) ?? null

  const setCrewsVisible = (crewsVisible: boolean) => {
    setLayers((current) => ({ ...current, crewsVisible }))
    if (!crewsVisible) {
      setSelectedCrewId(null)
      return
    }
    setFitToken((value) => value + 1)
  }

  if (fitToken !== fittedToken && layers.crewsVisible && !crewLocations.isPending) {
    setFittedToken(fitToken)
    const points = locatedCrews.flatMap((crew) =>
      crew.location ? [{ lat: crew.location.latitude, lng: crew.location.longitude }] : [],
    )
    if (points.length > 0) {
      setTarget((prev) => ({ key: (prev?.key ?? 0) + 1, kind: 'bounds', points }))
    }
  }

  if (selectedCrewId && !locatedCrews.some((crew) => crew.crewId === selectedCrewId)) {
    setSelectedCrewId(null)
  }

  // Al cambiar el mapa (otra versión o importación) la selección deja de tener sentido.
  const [shownMap, setShownMap] = useState(map)
  if (shownMap !== map) {
    setShownMap(map)
    setSelectedPlaceId(null)
    setSelectedCrewId(null)
    setSelectedRequirementId(null)
    setAddressPick(null)
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
    setSelectedCrewId(null)
    setSelectedRequirementId(null)
    setAddressPick(null)
    if (!window.matchMedia(WIDE_SCREEN).matches) setTrackingOpen(false)
  }

  useEffect(() => {
    const text = addressQuery.trim()
    if (text.length < 3) {
      setAddressHits([])
      setAddressError(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadPlacesLibrary()
          if (!addressSession.current) addressSession.current = newAddressSession()
          const hits = await suggestAddresses(text, addressSession.current)
          if (cancelled) return
          setAddressHits(hits)
          setAddressError(null)
        } catch (error) {
          if (cancelled) return
          setAddressHits([])
          setAddressError(messageOf(error, 'No se pudo buscar la dirección. Revisa que Places API esté habilitada.'))
        }
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [addressQuery])

  const chooseAddress = async (hit: AddressSuggestion) => {
    try {
      const resolved = await resolveAddress(hit.prediction)
      addressSession.current = null
      setAddressPick(resolved)
      setAddressQuery('')
      setAddressHits([])
      setAddressError(null)
      setSelectedPlaceId(null)
      setSelectedRequirementId(null)
      setSelectedCrewId(null)
      setTarget((prev) => ({
        key: (prev?.key ?? 0) + 1,
        kind: 'center',
        center: { lat: resolved.latitude, lng: resolved.longitude },
        zoom: 17,
      }))
    } catch (error) {
      setAddressError(messageOf(error, 'No se pudo usar esa dirección'))
    }
  }

  const selectRequirement = (id: string) => {
    const order = (orders.data ?? []).find((item) => item.id === id)
    setSelectedRequirementId(id)
    setSelectedPlaceId(null)
    setAddressPick(null)
    setSelectedCrewId(null)
    if (order?.place) {
      setTarget((prev) => ({
        key: (prev?.key ?? 0) + 1,
        kind: 'center',
        center: { lat: order.place!.latitude, lng: order.place!.longitude },
        zoom: 17,
      }))
    }
  }

  const focusCrew = (crewId: string) => {
    const crew = locatedCrews.find((item) => item.crewId === crewId)
    const fix = crew?.location
    if (!fix) return
    setSelectedPlaceId(null)
    setSelectedCrewId(crewId)
    if (!window.matchMedia(WIDE_SCREEN).matches) setTrackingOpen(false)
    setTarget((prev) => ({
      key: (prev?.key ?? 0) + 1,
      kind: 'center',
      center: { lat: fix.latitude, lng: fix.longitude },
      zoom: 16,
    }))
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

  const requirementPins = useMemo<RequirementMapPin[]>(() => {
    return (orders.data ?? [])
      .filter((order) => order.kind === 'REQUIREMENT' && isActiveOrder(order) && order.place)
      .map((order) => ({
        id: order.id,
        title: order.title || order.place?.name || 'Requerimiento',
        latitude: order.place!.latitude,
        longitude: order.place!.longitude,
        color: STATE_MARKER_COLOR[order.state] ?? '#C084FC',
      }))
  }, [orders.data])
  const selectedRequirement = (orders.data ?? []).find((order) => order.id === selectedRequirementId) ?? null

  const openTypedOrder = (kind: 'CORRECTIVE' | 'PREVENTIVE') => {
    if (!assignPlace) return
    const params = new URLSearchParams({ placeId: assignPlace.id, kind })
    const externalNumber = externalNumberFromPlaceName(assignPlace.name)
    if (externalNumber) params.set('external', externalNumber)
    if (assignPlace.name.trim()) params.set('placeName', assignPlace.name.trim())
    params.set('lat', String(assignPlace.latitude))
    params.set('lng', String(assignPlace.longitude))
    setAssignPlace(null)
    navigate(`${routes.workOrderNew}?${params.toString()}`)
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
        crews={crewPins}
        crewsVisible={isAdmin && layers.crewsVisible}
        selectedCrewId={selectedCrewId}
        onSelectCrew={focusCrew}
        requirements={requirementPins}
        selectedRequirementId={selectedRequirementId}
        onSelectRequirement={selectRequirement}
        addressPin={
          addressPick
            ? { latitude: addressPick.latitude, longitude: addressPick.longitude, title: addressPick.address }
            : null
        }
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
        {isAdmin ? (
          <div className="externals__search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Buscar dirección…"
              aria-label="Buscar dirección"
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
            />
            {addressQuery ? (
              <IconButton label="Limpiar dirección" size="sm" onClick={() => setAddressQuery('')}>
                <X />
              </IconButton>
            ) : null}
            {addressHits.length > 0 ? (
              <ul className="externals__results" role="listbox">
                {addressHits.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" role="option" onClick={() => void chooseAddress(hit)}>
                      <MapPin size={16} />
                      <span>{hit.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {addressError ? <p className="externals__search-error">{addressError}</p> : null}
          </div>
        ) : null}
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
          {isAdmin ? (
            <button
              type="button"
              className={`externals__tracking-toggle${layers.crewsVisible ? ' is-on' : ''}`}
              aria-pressed={layers.crewsVisible}
              title="Mostrar u ocultar la última posición de cada cuadrilla"
              onClick={() => setCrewsVisible(!layers.crewsVisible)}
            >
              <Users />
              <span>Cuadrillas</span>
              {layers.crewsVisible && crewLocations.data ? (
                <span className="externals__count">{locatedCrews.length}</span>
              ) : null}
            </button>
          ) : null}
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
              <span className="externals__wf-dot" style={{ background: workfrontColor(front.number) }} />
              WF{front.number}
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
          onFocusRequirement={selectRequirement}
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
          onAssign={() => setAssignPlace(selectedPlace)}
          onClose={() => setSelectedPlaceId(null)}
        />
      ) : addressPick ? (
        <AddressPickCard
          address={addressPick}
          onAssign={() => {
            const params = new URLSearchParams({
              kind: 'REQUIREMENT',
              address: addressPick.address,
              lat: String(addressPick.latitude),
              lng: String(addressPick.longitude),
            })
            navigate(`${routes.workOrderNew}?${params.toString()}`)
          }}
          onClose={() => setAddressPick(null)}
        />
      ) : selectedRequirement ? (
        <RequirementCard order={selectedRequirement} onClose={() => setSelectedRequirementId(null)} />
      ) : selectedCrew ? (
        <CrewCard crew={selectedCrew} nowMs={now.getTime()} onClose={() => setSelectedCrewId(null)} />
      ) : isAdmin && layers.crewsVisible && !trackingOpen ? (
        <CrewStrip
          crews={locatedCrews}
          nowMs={now.getTime()}
          failed={crewLocations.isError}
          onFocus={focusCrew}
          onRetry={() => void crewLocations.refetch()}
        />
      ) : null}

      <Dialog open={assignPlace !== null} title="Tipo de orden" onClose={() => setAssignPlace(null)}>
        <p className="externals__kind-copy">
          {assignPlace?.name ? `${assignPlace.name}. ` : ''}
          El correctivo sigue el reporte de WhatsApp. El preventivo lleva las instrucciones que escribas.
        </p>
        <div className="externals__kind-actions">
          <Button onClick={() => openTypedOrder('CORRECTIVE')}>Mantenimiento correctivo</Button>
          <Button variant="outlined" onClick={() => openTypedOrder('PREVENTIVE')}>
            Mantenimiento preventivo
          </Button>
        </div>
      </Dialog>

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
          {isAdmin ? (
            <label className="row externals__layer">
              <span>
                <Users size={18} /> Cuadrillas
              </span>
              <Switch checked={layers.crewsVisible} onChange={setCrewsVisible} label="Mostrar cuadrillas" />
            </label>
          ) : null}
          <p className="muted" style={{ fontSize: '0.8125rem' }}>
            {plural(map.places.length, 'punto', 'puntos')} · {plural(map.lines.length, 'trazo', 'trazos')} ·{' '}
            {plural(fronts.length, 'frente', 'frentes')}
            {isAdmin && layers.crewsVisible && crewLocations.data
              ? ` · ${plural(locatedCrews.length, 'cuadrilla en el mapa', 'cuadrillas en el mapa')}`
              : ''}
          </p>
          {isAdmin && layers.crewsVisible ? (
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              Se actualiza sola. El pin se pone gris si el servidor recibió la posición hace más de 15 minutos.
              {crewLocations.data && crewLocations.data.length > locatedCrews.length
                ? ` ${plural(crewLocations.data.length - locatedCrews.length, 'cuadrilla nunca reportó', 'cuadrillas nunca reportaron')}.`
                : ''}
            </p>
          ) : null}
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
  onFocusRequirement,
  onClose,
}: {
  orders: readonly WorkOrder[]
  loading: boolean
  crewById: ReadonlyMap<string, Crew>
  belowFronts: boolean
  selectedPlaceId: string | null
  placeIdOf: (order: WorkOrder) => string | null
  onFocus: (placeId: string) => void
  onFocusRequirement: (orderId: string) => void
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
          const requirement = order.kind === 'REQUIREMENT'
          const canFocus = requirement || Boolean(placeId)
          const crew = order.crewId ? crewById.get(order.crewId) : undefined
          const tone = STATE_TONE[order.state]
          const priority = maxPriority(order.items)
          const headline = isInstructionKind(order.kind) ? order.title || workOrderKindLabel(order.kind) : order.externalNumber || '—'
          return (
            <div
              key={order.id}
              className={`externals__ot externals__ot--${tone}${placeId && placeId === selectedPlaceId ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className="externals__ot-main"
                disabled={!canFocus}
                title={canFocus ? 'Ver en el mapa' : 'El punto no está en el mapa actual'}
                onClick={() => {
                  if (requirement) onFocusRequirement(order.id)
                  else if (placeId) onFocus(placeId)
                }}
              >
                <span className="externals__ot-top">
                  <span className="externals__ot-number">{headline}</span>
                  <span className="tone-pill tone-pill--neutral">{workOrderKindLabel(order.kind)}</span>
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

function AddressPickCard({
  address,
  onAssign,
  onClose,
}: {
  address: ResolvedAddress
  onAssign: () => void
  onClose: () => void
}) {
  return (
    <aside className="externals__place externals__place--accent" aria-label="Dirección encontrada">
      <div className="externals__place-head">
        <span className="externals__place-icon">
          <MapPin />
        </span>
        <div className="externals__place-title">
          <h3>{address.address}</h3>
          <span className="mono muted" style={{ fontSize: '0.75rem' }}>
            {address.latitude.toFixed(6)}, {address.longitude.toFixed(6)}
          </span>
        </div>
        <IconButton label="Cerrar" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="externals__place-status">
        <span className="tone-pill tone-pill--accent">Requerimiento</span>
      </div>
      <p className="externals__place-text">Esta dirección no es un externo del mapa. Puedes crear un requerimiento con instrucciones.</p>
      <div className="externals__place-actions">
        <Button icon={<ClipboardPlus />} onClick={onAssign}>
          Asignar requerimiento
        </Button>
      </div>
    </aside>
  )
}

function RequirementCard({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const navigate = useNavigate()
  const tone = STATE_TONE[order.state]
  return (
    <aside className={`externals__place externals__place--${tone}`} aria-label="Requerimiento">
      <div className="externals__place-head">
        <span className="externals__place-icon">
          <MapPin />
        </span>
        <div className="externals__place-title">
          <h3>{order.title || 'Requerimiento'}</h3>
          <span className="mono muted" style={{ fontSize: '0.75rem' }}>
            {order.place?.name || 'Sin dirección'}
          </span>
        </div>
        <IconButton label="Cerrar" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="externals__place-status">
        <span className={`tone-pill tone-pill--dot tone-pill--${tone}`}>{workOrderStateLabel(order.state)}</span>
        <span className="tone-pill tone-pill--neutral">Requerimiento</span>
      </div>
      <div className="externals__place-actions">
        <Button icon={<ClipboardList />} onClick={() => navigate(routes.workOrder(order.id))}>
          Ver orden
        </Button>
      </div>
    </aside>
  )
}

const PLACE_HISTORY_LIMIT = 5

function PlaceCard({
  place,
  orders,
  crewById,
  onAssign,
  onClose,
}: {
  place: MapPlace
  orders: readonly WorkOrder[]
  crewById: ReadonlyMap<string, Crew>
  onAssign: () => void
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
          <Button icon={<ClipboardPlus />} onClick={onAssign}>
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

function formatAccuracy(meters: number): string {
  if (meters >= 1000) {
    const kilometers = meters / 1000
    return `± ${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)} km`
  }
  return `± ${Math.round(meters)} m`
}

function CrewStrip({
  crews,
  nowMs,
  failed,
  onFocus,
  onRetry,
}: {
  crews: readonly CrewLocation[]
  nowMs: number
  failed: boolean
  onFocus: (crewId: string) => void
  onRetry: () => void
}) {
  if (crews.length === 0) {
    return (
      <div className="externals__crews">
        <span className="externals__crews-empty">
          {failed ? 'No se pudo cargar la posición de las cuadrillas' : 'Ninguna cuadrilla ha reportado posición'}
          {failed ? (
            <Button variant="text" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
        </span>
      </div>
    )
  }

  return (
    <div className="externals__crews chip-row" role="list">
      {crews.map((crew) => {
        const stale = crew.location ? isCrewFixStale(crew.location.receivedAt, nowMs) : false
        return (
          <button
            key={crew.crewId}
            type="button"
            className={['chip', stale ? 'chip--stale' : ''].join(' ')}
            title={crew.lead.fullName}
            onClick={() => onFocus(crew.crewId)}
          >
            {formatPlate(crew.plate)}
          </button>
        )
      })}
      {failed ? (
        <button type="button" className="chip" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  )
}

function CrewCard({ crew, nowMs, onClose }: { crew: CrewLocation; nowMs: number; onClose: () => void }) {
  const navigate = useNavigate()
  const fix = crew.location
  if (!fix) return null
  const stale = isCrewFixStale(fix.receivedAt, nowMs)
  const age = crewFixAgeLabel(fix.receivedAt, nowMs)
  const members = [crew.lead, crew.auxiliary, crew.boom]
  return (
    <article className={`externals__place${stale ? ' externals__place--caution' : ''}`} aria-label={crew.lead.fullName}>
      <div className="externals__place-head">
        <span className="externals__place-icon">
          <Users />
        </span>
        <div className="externals__place-title">
          <h3>{crew.lead.fullName}</h3>
          <span className="plate-tag">{formatPlate(crew.plate)}</span>
        </div>
        <IconButton label="Cerrar" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="externals__place-status">
        <span className={`tone-pill tone-pill--dot tone-pill--${stale ? 'caution' : 'accent'}`}>
          {stale ? `Posición vieja · ${age}` : `En el mapa · ${age}`}
        </span>
        {fix.accuracyMeters !== null && fix.accuracyMeters > 0 ? (
          <span className="tone-pill tone-pill--neutral">{formatAccuracy(fix.accuracyMeters)}</span>
        ) : null}
      </div>
      <ul className="externals__crew-members">
        {members.map((member) => (
          <li key={member.crewRole}>
            <span>{roleLabel[member.crewRole]}</span>
            <strong>{member.fullName}</strong>
          </li>
        ))}
      </ul>
      <p className="externals__crew-when">
        GPS {fix.recordedAt ? formatDateTime(fix.recordedAt) : 'sin hora'}
        {' · '}
        recibido {fix.receivedAt ? formatDateTime(fix.receivedAt) : 'sin hora'}
        {fix.reportedBy.fullName ? ` · envió ${fix.reportedBy.fullName}` : ''}
      </p>
      <div className="externals__place-actions">
        {crew.corporatePhone ? (
          <a className="btn btn--text btn--sm" href={`tel:${crew.corporatePhone}`}>
            {formatPhone(crew.corporatePhone)}
          </a>
        ) : null}
        <Button variant="text" size="sm" onClick={() => navigate(routes.crewEdit(crew.crewId))}>
          Ver cuadrilla
        </Button>
        {crew.vehicleId ? (
          <Button variant="text" size="sm" onClick={() => navigate(routes.vehicle(crew.vehicleId))}>
            Ver vehículo
          </Button>
        ) : null}
      </div>
    </article>
  )
}
