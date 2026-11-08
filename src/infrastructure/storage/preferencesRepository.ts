import type { LayerPreferences, PreferencesRepository } from '@/domain/repository'

const LAYERS_KEY = 'trafficnexus.externals.layers'

export class LocalPreferencesRepository implements PreferencesRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  layers(): LayerPreferences {
    const raw = this.storage.getItem(LAYERS_KEY)
    if (!raw) return { pointsVisible: true, linesVisible: true, crewsVisible: false }
    try {
      const parsed = JSON.parse(raw) as Partial<LayerPreferences>
      return {
        pointsVisible: parsed.pointsVisible !== false,
        linesVisible: parsed.linesVisible !== false,
        crewsVisible: parsed.crewsVisible === true,
      }
    } catch {
      return { pointsVisible: true, linesVisible: true, crewsVisible: false }
    }
  }

  saveLayers(prefs: LayerPreferences): void {
    this.storage.setItem(LAYERS_KEY, JSON.stringify(prefs))
  }
}
