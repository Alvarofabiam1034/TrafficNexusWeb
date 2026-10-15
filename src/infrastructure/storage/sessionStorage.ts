import type { Session } from '@/domain/model/user'
import { isAccountRole } from '@/domain/model/user'
import { isCrewRole } from '@/domain/model/crew'

const SESSION_KEY = 'trafficnexus.session'
const PROJECT_KEY = 'trafficnexus.project'

/**
 * La sesión vive en `sessionStorage`: se descarta al cerrar la pestaña y no la comparten
 * otras pestañas. Es la opción más conservadora para un JWT sin refresh token.
 * El proyecto elegido sí se recuerda en `localStorage`, porque no es un secreto.
 */
export class BrowserSessionStore {
  constructor(
    private readonly volatile: Storage = window.sessionStorage,
    private readonly durable: Storage = window.localStorage,
  ) {}

  read(): Session | null {
    const raw = this.volatile.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<Session>
      if (!parsed || typeof parsed.token !== 'string' || !parsed.user || typeof parsed.projectId !== 'string') {
        return null
      }
      const user = parsed.user
      if (typeof user.id !== 'string' || !isAccountRole(user.accountRole)) return null
      return {
        token: parsed.token,
        projectId: parsed.projectId,
        user: {
          id: user.id,
          email: typeof user.email === 'string' ? user.email : '',
          fullName: typeof user.fullName === 'string' ? user.fullName : '',
          accountRole: user.accountRole,
          crewRole: isCrewRole(user.crewRole) ? user.crewRole : null,
        },
      }
    } catch {
      return null
    }
  }

  write(session: Session): void {
    this.volatile.setItem(SESSION_KEY, JSON.stringify(session))
    this.durable.setItem(PROJECT_KEY, session.projectId)
  }

  rememberedProject(): string | null {
    return this.durable.getItem(PROJECT_KEY)
  }

  clear(): void {
    this.volatile.removeItem(SESSION_KEY)
  }
}
