import type { ReactNode } from 'react'

import './timeline.css'

export type TimelineTone = 'success' | 'caution' | 'info' | 'danger' | 'neutral'

/** Pasos horizontales en escritorio, verticales en pantallas angostas. */
export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="timeline">{children}</ol>
}

export function TimelineStep({
  label,
  tone,
  value,
  by,
  children,
}: {
  label: string
  tone: TimelineTone
  value: string
  by?: string
  children?: ReactNode
}) {
  return (
    <li className={`timeline-step timeline-step--${tone}`}>
      <span className="timeline-step__dot" aria-hidden />
      <div className="timeline-step__label">{label}</div>
      <div className="timeline-step__value">{value}</div>
      {by ? <div className="timeline-step__by">{by}</div> : null}
      {children}
    </li>
  )
}

export function TimelineProgress({ percent }: { percent: number }) {
  return (
    <div className="timeline-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
