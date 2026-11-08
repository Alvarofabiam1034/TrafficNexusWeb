import { useEffect, useRef, useState } from 'react'

import { workfrontStroke } from '@/domain/map/workfronts'
import { argbToCss, type MapLine, type MapPlace } from '@/domain/model/map'
import {
  BOGOTA,
  DEFAULT_ZOOM,
  loadGoogleMaps,
  MAP_DARK_STYLE,
  type MapCameraTarget,
} from '@/infrastructure/maps/googleMaps'
import { ErrorState, Loading } from '@/presentation/components/States'

const PLACE_COLOR = '#00D6A0'
const CREW_FRESH = '#00D6A0'
const CREW_STALE = '#9AA5B4'

/** Pin de cuadrilla. Solo la última posición, nunca un recorrido. */
export interface CrewMapPin {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly latitude: number
  readonly longitude: number
  readonly accuracyMeters: number | null
  readonly stale: boolean
}

interface CrewPinHandle {
  setMap(map: google.maps.Map | null): void
  render(pin: CrewMapPin, selected: boolean): void
}

let CrewPinCtor: (new (pin: CrewMapPin, onSelect: (id: string) => void) => CrewPinHandle) | null = null

function createCrewPin(pin: CrewMapPin, onSelect: (id: string) => void): CrewPinHandle {
  if (!CrewPinCtor) {
    CrewPinCtor = class extends google.maps.OverlayView implements CrewPinHandle {
      private readonly element: HTMLButtonElement
      private position: google.maps.LatLngLiteral

      constructor(initial: CrewMapPin, private readonly select: (id: string) => void) {
        super()
        this.position = { lat: initial.latitude, lng: initial.longitude }
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML =
          '<span class="crew-pin__plate"></span><span class="crew-pin__stem"></span><span class="crew-pin__dot"></span>'
        button.addEventListener('pointerdown', (event) => event.stopPropagation())
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          this.select(initial.id)
        })
        this.element = button
        this.render(initial, false)
      }

      render(next: CrewMapPin, selected: boolean): void {
        this.position = { lat: next.latitude, lng: next.longitude }
        this.element.className = `crew-pin${next.stale ? ' crew-pin--stale' : ''}${selected ? ' crew-pin--selected' : ''}`
        this.element.title = next.title
        this.element.setAttribute('aria-label', next.title)
        const plate = this.element.querySelector('.crew-pin__plate')
        if (plate) plate.textContent = next.label
        this.draw()
      }

      override onAdd(): void {
        this.getPanes()?.overlayMouseTarget.appendChild(this.element)
      }

      override draw(): void {
        const projection = this.getProjection()
        if (!projection) return
        const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position))
        if (!point) return
        this.element.style.left = `${point.x}px`
        this.element.style.top = `${point.y}px`
      }

      override onRemove(): void {
        this.element.remove()
      }
    }
  }
  return new CrewPinCtor(pin, onSelect)
}

function syncAccuracyCircle(
  map: google.maps.Map,
  circles: Map<string, google.maps.Circle>,
  pin: CrewMapPin,
): void {
  const radius = pin.accuracyMeters
  const show = radius !== null && radius > 0
  const existing = circles.get(pin.id)
  if (!show) {
    existing?.setMap(null)
    circles.delete(pin.id)
    return
  }
  const color = pin.stale ? CREW_STALE : CREW_FRESH
  const options: google.maps.CircleOptions = {
    map,
    center: { lat: pin.latitude, lng: pin.longitude },
    radius,
    strokeColor: color,
    strokeOpacity: pin.stale ? 0.4 : 0.75,
    strokeWeight: 1,
    fillColor: color,
    fillOpacity: pin.stale ? 0.05 : 0.12,
    clickable: false,
    zIndex: 0,
  }
  if (existing) existing.setOptions(options)
  else circles.set(pin.id, new google.maps.Circle(options))
}

interface GoogleMapViewProps {
  places: readonly MapPlace[]
  lines: readonly MapLine[]
  pointsVisible: boolean
  linesVisible: boolean
  selectedPlaceId: string | null
  target: MapCameraTarget | null
  onSelectPlace: (placeId: string) => void
  /** Color de relleno por punto (p. ej. estado de su OT activa). Los puntos con color se dibujan encima. */
  placeColors?: ReadonlyMap<string, string>
  crews?: readonly CrewMapPin[]
  crewsVisible?: boolean
  selectedCrewId?: string | null
  onSelectCrew?: (crewId: string) => void
}

export function GoogleMapView({
  places,
  lines,
  pointsVisible,
  linesVisible,
  selectedPlaceId,
  target,
  onSelectPlace,
  placeColors,
  crews = [],
  crewsVisible = false,
  selectedCrewId = null,
  onSelectCrew = () => {},
}: GoogleMapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map())
  const crewPinsRef = useRef<Map<string, CrewPinHandle>>(new Map())
  const crewCirclesRef = useRef<Map<string, google.maps.Circle>>(new Map())
  const onSelectRef = useRef(onSelectPlace)
  const onSelectCrewRef = useRef(onSelectCrew)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelectPlace
    onSelectCrewRef.current = onSelectCrew
  })

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    void loadGoogleMaps()
      .then((maps) => {
        if (cancelled || mapRef.current) return
        mapRef.current = new maps.Map(host, {
          center: BOGOTA,
          zoom: DEFAULT_ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          clickableIcons: false,
          gestureHandling: 'greedy',
          keyboardShortcuts: false,
          backgroundColor: '#0E1115',
          styles: MAP_DARK_STYLE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        setReady(true)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'No se pudo cargar Google Maps')
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Cámara: centro o límites
  useEffect(() => {
    const map = mapRef.current
    if (!map || !target || !ready) return
    if (target.kind === 'center') {
      map.panTo(target.center)
      map.setZoom(target.zoom ?? Math.max(map.getZoom() ?? DEFAULT_ZOOM, 16))
      return
    }
    if (target.points.length === 0) return
    if (target.points.length === 1) {
      const only = target.points[0]!
      map.panTo(only)
      map.setZoom(16)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    for (const point of target.points) bounds.extend(point)
    map.fitBounds(bounds, 48)
  }, [target, ready])

  // Trazos
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const keep = new Set(linesVisible ? lines.map((line) => line.id) : [])

    for (const [id, polyline] of polylinesRef.current) {
      if (!keep.has(id)) {
        polyline.setMap(null)
        polylinesRef.current.delete(id)
      }
    }

    if (!linesVisible) return

    for (const line of lines) {
      const path = line.points.map((point) => ({ lat: point.latitude, lng: point.longitude }))
      const color = workfrontStroke(line.name) ?? argbToCss(line.colorArgb)
      const weight = Math.max(2, line.width / 2)
      const existing = polylinesRef.current.get(line.id)
      if (existing) {
        existing.setPath(path)
        existing.setOptions({ strokeColor: color, strokeWeight: weight, strokeOpacity: 0.9 })
        continue
      }
      const polyline = new google.maps.Polyline({
        map,
        path,
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: 0.9,
        clickable: false,
      })
      polylinesRef.current.set(line.id, polyline)
    }
  }, [lines, linesVisible, ready])

  // Puntos
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const keep = new Set(pointsVisible ? places.map((place) => place.id) : [])

    for (const [id, marker] of markersRef.current) {
      if (!keep.has(id)) {
        google.maps.event.clearInstanceListeners(marker)
        marker.setMap(null)
        markersRef.current.delete(id)
      }
    }

    if (!pointsVisible) return

    for (const place of places) {
      const selected = place.id === selectedPlaceId
      const color = placeColors?.get(place.id)
      const icon = circleIcon(color ?? PLACE_COLOR, selected, color !== undefined)
      const zIndex = selected ? 3 : color ? 2 : 1
      const position = { lat: place.latitude, lng: place.longitude }
      const existing = markersRef.current.get(place.id)
      if (existing) {
        existing.setPosition(position)
        existing.setIcon(icon)
        existing.setTitle(place.name)
        existing.setZIndex(zIndex)
        continue
      }
      const marker = new google.maps.Marker({
        map,
        position,
        icon,
        title: place.name,
        zIndex,
        optimized: true,
      })
      marker.addListener('click', () => onSelectRef.current(place.id))
      markersRef.current.set(place.id, marker)
    }
  }, [places, pointsVisible, selectedPlaceId, placeColors, ready])

  // Cuadrillas: pin con placa y radio de precisión. Se actualiza en el sitio.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const pins = crewsVisible ? crews : []
    const keep = new Set(pins.map((pin) => pin.id))

    for (const [id, pin] of crewPinsRef.current) {
      if (!keep.has(id)) {
        pin.setMap(null)
        crewPinsRef.current.delete(id)
      }
    }
    for (const [id, circle] of crewCirclesRef.current) {
      if (!keep.has(id)) {
        circle.setMap(null)
        crewCirclesRef.current.delete(id)
      }
    }

    for (const pin of pins) {
      const existing = crewPinsRef.current.get(pin.id)
      if (existing) existing.render(pin, pin.id === selectedCrewId)
      else {
        const overlay = createCrewPin(pin, (id) => onSelectCrewRef.current(id))
        overlay.setMap(map)
        crewPinsRef.current.set(pin.id, overlay)
      }
      syncAccuracyCircle(map, crewCirclesRef.current, pin)
    }
  }, [crews, crewsVisible, selectedCrewId, ready])

  // Cleanup al desmontar
  useEffect(() => {
    const crewPins = crewPinsRef.current
    const crewCircles = crewCirclesRef.current
    const markers = markersRef.current
    const polylines = polylinesRef.current
    return () => {
      for (const marker of markers.values()) {
        google.maps.event.clearInstanceListeners(marker)
        marker.setMap(null)
      }
      markers.clear()
      for (const polyline of polylines.values()) polyline.setMap(null)
      polylines.clear()
      for (const pin of crewPins.values()) pin.setMap(null)
      crewPins.clear()
      for (const circle of crewCircles.values()) circle.setMap(null)
      crewCircles.clear()
      mapRef.current = null
    }
  }, [])

  return (
    <div className="externals__map-host">
      <div ref={hostRef} className="externals__map" role="presentation" />
      {!ready && !error ? (
        <div className="externals__overlay">
          <Loading label="Cargando Google Maps…" />
        </div>
      ) : null}
      {error ? (
        <div className="externals__overlay">
          <ErrorState message={error} />
        </div>
      ) : null}
    </div>
  )
}

function circleIcon(color: string, selected: boolean, highlighted: boolean): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 11 : highlighted ? 8.5 : 6.5,
    fillColor: color,
    fillOpacity: 0.95,
    strokeColor: selected ? '#FFFFFF' : '#0E1115',
    strokeWeight: selected ? 3.5 : highlighted ? 2 : 1.5,
  }
}
