import { useEffect, useRef, useState } from 'react'

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
const SELECTED_COLOR = '#FFC928'

interface GoogleMapViewProps {
  places: readonly MapPlace[]
  lines: readonly MapLine[]
  pointsVisible: boolean
  linesVisible: boolean
  selectedPlaceId: string | null
  target: MapCameraTarget | null
  onSelectPlace: (placeId: string) => void
}

export function GoogleMapView({
  places,
  lines,
  pointsVisible,
  linesVisible,
  selectedPlaceId,
  target,
  onSelectPlace,
}: GoogleMapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map())
  const onSelectRef = useRef(onSelectPlace)
  onSelectRef.current = onSelectPlace

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const color = argbToCss(line.colorArgb)
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
      const icon = circleIcon(selected)
      const position = { lat: place.latitude, lng: place.longitude }
      const existing = markersRef.current.get(place.id)
      if (existing) {
        existing.setPosition(position)
        existing.setIcon(icon)
        existing.setTitle(place.name)
        existing.setZIndex(selected ? 2 : 1)
        continue
      }
      const marker = new google.maps.Marker({
        map,
        position,
        icon,
        title: place.name,
        zIndex: selected ? 2 : 1,
        optimized: true,
      })
      marker.addListener('click', () => onSelectRef.current(place.id))
      markersRef.current.set(place.id, marker)
    }
  }, [places, pointsVisible, selectedPlaceId, ready])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      for (const marker of markersRef.current.values()) {
        google.maps.event.clearInstanceListeners(marker)
        marker.setMap(null)
      }
      markersRef.current.clear()
      for (const polyline of polylinesRef.current.values()) polyline.setMap(null)
      polylinesRef.current.clear()
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

function circleIcon(selected: boolean): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 10 : 7,
    fillColor: selected ? SELECTED_COLOR : PLACE_COLOR,
    fillOpacity: 0.9,
    strokeColor: selected ? '#FFE082' : '#00A87E',
    strokeWeight: selected ? 3 : 1.5,
  }
}
