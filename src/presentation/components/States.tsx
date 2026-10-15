import { AlertCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './Button'

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <AlertCircle size={40} color="var(--status-alert)" />
      <p style={{ color: 'var(--fg)' }}>{message}</p>
      {onRetry ? (
        <Button variant="outlined" icon={<RefreshCw />} onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="state">
      <span className="icon-badge icon-badge--hi">{icon}</span>
      <h3 style={{ marginTop: 6 }}>{title}</h3>
      <p>{body}</p>
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  )
}

export function InlineMessage({
  kind = 'error',
  icon,
  children,
}: {
  kind?: 'error' | 'info' | 'success'
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`inline-message inline-message--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {icon ?? <AlertCircle />}
      <span>{children}</span>
    </div>
  )
}
