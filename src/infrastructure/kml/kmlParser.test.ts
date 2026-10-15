import { describe, expect, it } from 'vitest'

import { workfronts } from '@/domain/map/workfronts'

import { parseKmlText } from './kmlParser'

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="red"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle></Style>
    <Placemark>
      <name>Semáforo Calle 26</name>
      <description><![CDATA[<b>Intersección</b> principal]]></description>
      <Point><coordinates>-74.1036,4.6483,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>WF 3 - Corredor 26</name>
      <styleUrl>#red</styleUrl>
      <LineString><coordinates>-74.1040,4.6480,0 -74.1030,4.6486,0</coordinates></LineString>
    </Placemark>
  </Document>
</kml>`

describe('kmlParser', () => {
  it('extrae puntos y trazos con estilo', () => {
    const map = parseKmlText(KML)
    expect(map.places).toHaveLength(1)
    expect(map.places[0]?.name).toBe('Semáforo Calle 26')
    expect(map.places[0]?.description).toBe('Intersección principal')
    expect(map.places[0]?.latitude).toBeCloseTo(4.6483)
    expect(map.places[0]?.longitude).toBeCloseTo(-74.1036)

    expect(map.lines).toHaveLength(1)
    const line = map.lines[0]
    expect(line?.points).toHaveLength(2)
    // aabbggrr ff0000ff -> rojo opaco
    expect((line?.colorArgb ?? 0) >>> 0).toBe(0xffff0000)
    expect(line?.width).toBe(4)
  })

  it('rechaza DOCTYPE', () => {
    expect(() => parseKmlText('<!DOCTYPE kml><kml></kml>')).toThrow()
  })

  it('agrupa los frentes de trabajo por el nombre del trazo', () => {
    const map = parseKmlText(KML)
    const fronts = workfronts(map.places, map.lines)
    expect(fronts).toHaveLength(1)
    expect(fronts[0]?.number).toBe(3)
    expect(fronts[0]?.placeIds.size).toBe(1)
  })
})
