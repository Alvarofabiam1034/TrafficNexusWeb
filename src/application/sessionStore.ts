import type { Session } from '@/domain/model/user'

type Listener = () => void

/** Estado observable de la sesión. Compatible con `useSyncExternalStore`. */
export class SessionStore {
  private listeners = new Set<Listener>()

  constructor(private session: Session | null) {}

  get current(): Session | null {
    return this.session
  }

  set(next: Session | null): void {
    if (next === this.session) return
    this.session = next
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): Session | null => this.session
}
