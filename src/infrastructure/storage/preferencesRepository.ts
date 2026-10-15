import type { LayerPreferences, PreferencesRepository } from '@/domain/repository'

const LAYERS_KEY = 'trafficnexus.externals.layers'

export class LocalPreferencesRepository implements PreferencesRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  layers(): LayerPreferences {
    const raw = this.storage.getItem(LAYERS_KEY)
    if (!raw) return { pointsVisible: true, linesVisible: true }
    try {
      const parsed = JSON.parse(raw) as Partial<LayerPreferences>
      return {
        pointsVisible: parsed.pointsVisible !== false,
        linesVisible: parsed.linesVisible !== false,
      }
    } catch {
      return { pointsVisible: true, linesVisible: true }
    }
  }

  saveLayers(prefs: LayerPreferences): void {
    this.storage.setItem(LAYERS_KEY, JSON.stringify(prefs))
  }
}
