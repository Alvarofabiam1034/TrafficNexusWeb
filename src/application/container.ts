import type { Session } from '@/domain/model/user'
import type {
  CrewRepository,
  FleetRepository,
  InventoryRepository,
  MapRepository,
  PreferencesRepository,
  ProjectRepository,
  SessionRepository,
  UserRepository,
} from '@/domain/repository'
import {
  ApiCrewRepository,
  ApiFleetRepository,
  ApiInventoryRepository,
  ApiMapRepository,
  ApiProjectRepository,
  ApiSessionRepository,
  ApiUserRepository,
} from '@/infrastructure/api/repositories'
import { HttpClient } from '@/infrastructure/http/httpClient'
import { LocalPreferencesRepository } from '@/infrastructure/storage/preferencesRepository'
import { BrowserSessionStore } from '@/infrastructure/storage/sessionStorage'

import { SessionStore } from './sessionStore'

export interface AppContainer {
  readonly sessionStore: SessionStore
  readonly session: SessionRepository
  readonly projects: ProjectRepository
  readonly users: UserRepository
  readonly crews: CrewRepository
  readonly fleet: FleetRepository
  readonly inventory: InventoryRepository
  readonly map: MapRepository
  readonly preferences: PreferencesRepository
}

/**
 * Único sitio que enchufa infraestructura con dominio. La URL base sale de
 * `VITE_API_BASE_URL`; vacía significa mismo origen (proxy de Vite o reverse proxy).
 */
export function createContainer(baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? ''): AppContainer {
  const browserStore = new BrowserSessionStore()
  const sessionStore = new SessionStore(browserStore.read())

  const http = new HttpClient(baseUrl, {
    token: () => sessionStore.current?.token ?? null,
    onUnauthorized: () => {
      browserStore.clear()
      sessionStore.set(null)
    },
  })

  const session = new ApiSessionRepository(http, browserStore, (next: Session | null) => sessionStore.set(next))

  return {
    sessionStore,
    session,
    projects: new ApiProjectRepository(http),
    users: new ApiUserRepository(http),
    crews: new ApiCrewRepository(http),
    fleet: new ApiFleetRepository(http),
    inventory: new ApiInventoryRepository(http),
    map: new ApiMapRepository(http),
    preferences: new LocalPreferencesRepository(),
  }
}
