import { ExternalLink, FileUp, History, Layers, MapPin, Route, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { useContainer, useIsAdmin } from '@/application/ContainerContext'
import { useImportMap, useLatestMap, useMapVersion, useMapVersions } from '@/application/hooks/useMap'
import { messageOf } from '@/domain/errors'
import { workfronts, type Workfront } from '@/domain/map/workfronts'
import { EMPTY_MAP, type MapPlace, type StoredMap } from '@/domain/model/map'
import type { LayerPreferences } from '@/domain/repository'
import { parseKmlFile } from '@/infrastructure/kml/kmlParser'
import type { MapCameraTarget } from '@/infrastructure/maps/googleMaps'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Switch } from '@/presentation/components/Switch'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import { GoogleMapView } from './GoogleMapView'
import './externals.css'

const MAX_FILE_BYTES = 25 * 1024 * 1024

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

  useEffect(() => preferences.saveLayers(layers), [layers, preferences])

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

  const focusPlace = (place: MapPlace) => {
    setSelectedPlaceId(place.id)
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
        onSelectPlace={setSelectedPlaceId}
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

      {selectedPlace ? <PlaceCard place={selectedPlace} onClose={() => setSelectedPlaceId(null)} /> : null}

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

function PlaceCard({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
  return (
    <aside className="externals__place card" aria-label={`Detalle de ${place.name}`}>
      <div className="externals__place-head">
        <span className="icon-badge icon-badge--hi">
          <MapPin />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{place.name || 'Sin nombre'}</h3>
          <span className="mono muted" style={{ fontSize: '0.75rem' }}>
            {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
          </span>
        </div>
        <IconButton label="Cerrar" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {place.description ? <p className="externals__place-text">{place.description}</p> : null}
      {place.documentation ? (
        <p className="externals__place-text muted" style={{ fontSize: '0.8125rem' }}>
          {place.documentation}
        </p>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button
          variant="text"
          size="sm"
          icon={<ExternalLink />}
          onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
        >
          Abrir en Google Maps
        </Button>
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
