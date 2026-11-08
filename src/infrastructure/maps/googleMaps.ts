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

let placesLoading: Promise<void> | null = null

/** Librería Places, para buscar una dirección que no es un externo del mapa. */
export function loadPlacesLibrary(): Promise<void> {
  if (!placesLoading) {
    placesLoading = loadGoogleMaps()
      .then(() => importLibrary('places'))
      .then(() => undefined)
  }
  return placesLoading
}

export interface AddressSuggestion {
  readonly id: string
  readonly label: string
  readonly prediction: google.maps.places.PlacePrediction
}

export interface ResolvedAddress {
  readonly address: string
  readonly latitude: number
  readonly longitude: number
}

export function newAddressSession(): google.maps.places.AutocompleteSessionToken {
  return new google.maps.places.AutocompleteSessionToken()
}

/** Sugerencias de dirección en Colombia, sesgadas a Bogotá. */
export async function suggestAddresses(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): Promise<AddressSuggestion[]> {
  await loadPlacesLibrary()
  const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    includedRegionCodes: ['co'],
    language: 'es',
    region: 'CO',
    origin: BOGOTA,
    sessionToken,
  })
  const hits: AddressSuggestion[] = []
  for (const suggestion of suggestions) {
    const prediction = suggestion.placePrediction
    if (!prediction) continue
    hits.push({ id: prediction.placeId, label: prediction.text.text, prediction })
  }
  return hits
}

/** Dirección y coordenadas del resultado elegido. Cierra la sesión de autocomplete. */
export async function resolveAddress(prediction: google.maps.places.PlacePrediction): Promise<ResolvedAddress> {
  const place = prediction.toPlace()
  await place.fetchFields({ fields: ['formattedAddress', 'location', 'displayName'] })
  const location = place.location
  if (!location) throw new Error('La dirección no tiene coordenadas')
  const address = place.formattedAddress?.trim() || place.displayName?.trim() || ''
  if (!address) throw new Error('La dirección no tiene nombre')
  return { address, latitude: location.lat(), longitude: location.lng() }
}

export const BOGOTA = { lat: 4.6483, lng: -74.1036 } as const
export const DEFAULT_ZOOM = 12
export const MAP_DARK_STYLE = darkStyle as google.maps.MapTypeStyle[]

export type MapLatLng = { lat: number; lng: number }

export type MapCameraTarget =
  | { key: number; kind: 'center'; center: MapLatLng; zoom?: number }
  | { key: number; kind: 'bounds'; points: readonly MapLatLng[] }
