export interface MapCoordinate {
  readonly latitude: number
  readonly longitude: number
}

export interface MapPlace {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly documentation: string
  readonly latitude: number
  readonly longitude: number
}

export interface MapLine {
  readonly id: string
  readonly name: string
  readonly points: readonly MapCoordinate[]
  /** Color ARGB empaquetado en 32 bits, como lo guarda el backend. */
  readonly colorArgb: number
  readonly width: number
}

export interface StoredMap {
  readonly places: readonly MapPlace[]
  readonly lines: readonly MapLine[]
}

export const EMPTY_MAP: StoredMap = { places: [], lines: [] }

export interface MapVersionSummary {
  readonly id: string
  readonly versionNumber: number
  readonly createdAt: string
  readonly createdByName: string
}

export interface MapVersion extends MapVersionSummary, StoredMap {}

/** "#RRGGBB" para CSS. */
export function argbToCss(argb: number): string {
  const rgb = argb & 0xffffff
  return `#${rgb.toString(16).padStart(6, '0')}`
}
