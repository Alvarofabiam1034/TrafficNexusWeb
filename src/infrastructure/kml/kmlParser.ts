import { unzipSync } from 'fflate'

import type { MapCoordinate, MapLine, MapPlace, StoredMap } from '@/domain/model/map'

const DEFAULT_LINE_COLOR = 0xff7c4dff | 0
const DEFAULT_WIDTH = 8

/**
 * Lee un KML o KMZ y devuelve lugares (Point) y trazos (LineString).
 * Usa `DOMParser` del navegador: no resuelve entidades externas ni DTDs.
 */
export async function parseKmlFile(file: Blob): Promise<StoredMap> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) return { places: [], lines: [] }
  const kml = isZip(bytes) ? extractKml(bytes) : bytes
  return parseKmlText(new TextDecoder('utf-8').decode(kml))
}

export function parseKmlText(xml: string): StoredMap {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('El archivo contiene una declaración DOCTYPE no permitida')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es XML válido')
  }

  const colors = new Map<string, number>()
  const widths = new Map<string, number>()
  const links = new Map<string, string>()
  collectStyles(document.documentElement, colors, widths, links)

  const places: MapPlace[] = []
  const lines: MapLine[] = []
  const used = new Set<string>()
  const placemarks = document.getElementsByTagName('Placemark')
  for (let index = 0; index < placemarks.length; index++) {
    const placemark = placemarks.item(index)
    if (!placemark) continue
    const rawId = placemark.getAttribute('id')?.trim() ?? ''
    const name = plainText(directChild(placemark, 'name')?.textContent ?? '')
    const point = directChild(placemark, 'Point')
    if (point) {
      const position = allCoordinates(directChild(point, 'coordinates')?.textContent ?? '')[0]
      if (!position) continue
      const description = plainText(directChild(placemark, 'description')?.textContent ?? '')
      const id = uniqueId(rawId || `${position.latitude},${position.longitude}`, used)
      places.push({
        id,
        name,
        description,
        documentation: '',
        latitude: position.latitude,
        longitude: position.longitude,
      })
      continue
    }
    const line = directChild(placemark, 'LineString')
    if (!line) continue
    const path = allCoordinates(directChild(line, 'coordinates')?.textContent ?? '')
    if (path.length < 2) continue
    const styleId = (directChild(placemark, 'styleUrl')?.textContent ?? '').trim().replace(/^#/, '')
    const [color, width] = resolvePaint(styleId, colors, widths, links)
    const first = path[0] as MapCoordinate
    const id = uniqueId(rawId || `${first.latitude},${first.longitude},line`, used)
    lines.push({ id, name, points: path, colorArgb: color, width })
  }
  return { places, lines }
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

function extractKml(bytes: Uint8Array): Uint8Array {
  const entries = unzipSync(bytes)
  let fallback: Uint8Array | null = null
  for (const [name, data] of Object.entries(entries)) {
    if (!/\.kml$/i.test(name)) continue
    if (/^(.*\/)?doc\.kml$/i.test(name)) return data
    fallback ??= data
  }
  return fallback ?? bytes
}

function directChild(parent: Element, tag: string): Element | null {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children.item(index)
    if (child && localName(child) === tag) return child
  }
  return null
}

function localName(element: Element): string {
  return element.localName || element.tagName.replace(/^.*:/, '')
}

function allCoordinates(raw: string): MapCoordinate[] {
  const result: MapCoordinate[] = []
  for (const tuple of raw.trim().split(/\s+/)) {
    if (!tuple.includes(',')) continue
    const parts = tuple.split(',')
    const longitude = Number.parseFloat(parts[0] ?? '')
    const latitude = Number.parseFloat(parts[1] ?? '')
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue
    result.push({ latitude, longitude })
  }
  return result
}

function collectStyles(
  element: Element,
  colors: Map<string, number>,
  widths: Map<string, number>,
  links: Map<string, string>,
): void {
  const id = (element.getAttribute('id') ?? element.getAttribute('kml:id') ?? '').trim()
  if (id) {
    if (localName(element).endsWith('StyleMap')) {
      const normal = normalStyleUrl(element)
      if (normal) links.set(id, normal)
    }
    const paint = linePaint(element)
    if (paint) {
      colors.set(id, paint[0])
      widths.set(id, paint[1])
    }
  }
  for (let index = 0; index < element.children.length; index++) {
    const child = element.children.item(index)
    if (child) collectStyles(child, colors, widths, links)
  }
}

function normalStyleUrl(styleMap: Element): string | null {
  for (let index = 0; index < styleMap.children.length; index++) {
    const pair = styleMap.children.item(index)
    if (!pair || localName(pair) !== 'Pair') continue
    if (directChild(pair, 'key')?.textContent?.trim() !== 'normal') continue
    return directChild(pair, 'styleUrl')?.textContent?.trim().replace(/^#/, '') ?? null
  }
  return null
}

function linePaint(element: Element): [color: number, width: number] | null {
  const lineStyle = findDescendant(element, 'LineStyle')
  if (!lineStyle) return null
  const color = kmlColor(directChild(lineStyle, 'color')?.textContent ?? '')
  if (color === null) return null
  const width = Number.parseFloat(directChild(lineStyle, 'width')?.textContent?.trim() ?? '')
  return [color, Number.isFinite(width) ? width : DEFAULT_WIDTH]
}

function findDescendant(element: Element, tag: string): Element | null {
  for (let index = 0; index < element.children.length; index++) {
    const child = element.children.item(index)
    if (!child) continue
    if (localName(child) === tag) return child
    const nested = findDescendant(child, tag)
    if (nested) return nested
  }
  return null
}

/** KML guarda aabbggrr; lo pasamos a ARGB opaco. */
function kmlColor(raw: string): number | null {
  const hex = raw.trim().replace(/^#/, '')
  if (hex.length !== 8 || !/^[0-9a-fA-F]+$/.test(hex)) return null
  const value = Number.parseInt(hex, 16)
  const blue = (value >>> 16) & 0xff
  const green = (value >>> 8) & 0xff
  const red = value & 0xff
  return ((0xff << 24) | (red << 16) | (green << 8) | blue) | 0
}

function resolvePaint(
  styleId: string,
  colors: Map<string, number>,
  widths: Map<string, number>,
  links: Map<string, string>,
): [color: number, width: number] {
  let current = styleId
  let width = DEFAULT_WIDTH
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const w = widths.get(current)
    if (w !== undefined) width = w
    const color = colors.get(current)
    if (color !== undefined) return [color, Math.min(14, Math.max(3, width))]
    current = links.get(current) ?? ''
  }
  return [DEFAULT_LINE_COLOR, DEFAULT_WIDTH]
}

function plainText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\t\v\f\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix++
  const id = `${base}-${suffix}`
  used.add(id)
  return id
}
