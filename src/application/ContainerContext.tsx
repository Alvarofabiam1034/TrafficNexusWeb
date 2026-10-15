import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'

import type { Session } from '@/domain/model/user'

import type { AppContainer } from './container'

const ContainerContext = createContext<AppContainer | null>(null)

export function ContainerProvider({ container, children }: { container: AppContainer; children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext)
  if (!container) throw new Error('useContainer debe usarse dentro de ContainerProvider')
  return container
}

export function useSession(): Session | null {
  const { sessionStore } = useContainer()
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.snapshot, sessionStore.snapshot)
}

/** Sesión garantizada: solo para pantallas detrás del guard de autenticación. */
export function useRequiredSession(): Session {
  const session = useSession()
  if (!session) throw new Error('No hay sesión activa')
  return session
}

export function useIsAdmin(): boolean {
  return useSession()?.user.accountRole === 'ADMIN'
}
