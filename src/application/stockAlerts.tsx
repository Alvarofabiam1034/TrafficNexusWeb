import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { StockAlert } from '@/domain/model/stockAlert'

import { useContainer, useIsAdmin, useRequiredSession } from './ContainerContext'

interface StockAlertsValue {
  readonly alerts: readonly StockAlert[]
  /** Hay un snapshot (SSE o GET). Hasta entonces el badge no debe inventar un cero definitivo. */
  readonly ready: boolean
  readonly failed: boolean
  refresh: () => Promise<void>
}

const StockAlertsContext = createContext<StockAlertsValue | null>(null)

const idleAlerts: StockAlertsValue = {
  alerts: [],
  ready: true,
  failed: false,
  refresh: async () => {},
}

export function useStockAlerts(): StockAlertsValue {
  const value = useContext(StockAlertsContext)
  if (!value) throw new Error('useStockAlerts debe usarse dentro de StockAlertsProvider')
  return value
}

/**
 * Una sola conexión SSE por sesión de admin y proyecto.
 * Se cierra al desmontar el shell (logout) o al cambiar de proyecto.
 * Cerrar el panel no corta el stream.
 */
export function StockAlertsProvider({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin()
  const session = useRequiredSession()
  if (!isAdmin) return <StockAlertsContext.Provider value={idleAlerts}>{children}</StockAlertsContext.Provider>
  return (
    <LiveStockAlerts key={`${session.projectId}:${session.token}`} projectId={session.projectId}>
      {children}
    </LiveStockAlerts>
  )
}

function LiveStockAlerts({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { stockAlerts } = useContainer()
  const [alerts, setAlerts] = useState<readonly StockAlert[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const sseAt = useRef(0)

  useEffect(() => {
    let alive = true
    sseAt.current = 0
    const apply = (next: readonly StockAlert[]) => {
      sseAt.current = Date.now()
      if (!alive) return
      setAlerts(next)
      setReady(true)
      setFailed(false)
    }
    const stop = stockAlerts.watch(
      projectId,
      apply,
      () => {
        const started = Date.now()
        void stockAlerts.list(projectId).then(
          (next) => {
            if (!alive || sseAt.current >= started) return
            apply(next)
          },
          () => {
            if (!alive || sseAt.current > 0) return
            setFailed(true)
          },
        )
      },
    )

    const started = Date.now()
    void stockAlerts.list(projectId).then(
      (next) => {
        if (!alive || sseAt.current >= started) return
        setAlerts(next)
        setReady(true)
        setFailed(false)
      },
      () => {
        if (!alive || sseAt.current > 0) return
        setFailed(true)
      },
    )

    return () => {
      alive = false
      stop()
    }
  }, [projectId, stockAlerts])

  const refresh = useCallback(async () => {
    const started = Date.now()
    try {
      const next = await stockAlerts.list(projectId)
      if (sseAt.current < started) {
        setAlerts(next)
        setReady(true)
        setFailed(false)
      }
    } catch {
      if (sseAt.current === 0) setFailed(true)
    }
  }, [projectId, stockAlerts])

  const value = useMemo<StockAlertsValue>(
    () => ({ alerts, ready, failed, refresh }),
    [alerts, failed, ready, refresh],
  )

  return <StockAlertsContext.Provider value={value}>{children}</StockAlertsContext.Provider>
}
