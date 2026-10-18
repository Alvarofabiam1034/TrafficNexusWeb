import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

import darkStyle from '@/presentation/features/externals/mapStyleDark.json'

let loading: Promise<typeof google.maps> | null = null

/** Carga única del Maps JavaScript API. Requiere `VITE_GOOGLE_MAPS_KEY`. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim() ?? ''
  if (!key) {
    return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_KEY en el archivo .env'))
  }
  if (!loading) {
    setOptions({ key, v: 'weekly', language: 'es', region: 'CO' })
    loading = importLibrary('maps').then(() => google.maps)
  }
  return loading
}

export const BOGOTA = { lat: 4.6483, lng: -74.1036 } as const
export const DEFAULT_ZOOM = 12
export const MAP_DARK_STYLE = darkStyle as google.maps.MapTypeStyle[]

export type MapLatLng = { lat: number; lng: number }

export type MapCameraTarget =
  | { key: number; kind: 'center'; center: MapLatLng; zoom?: number }
  | { key: number; kind: 'bounds'; points: readonly MapLatLng[] }
