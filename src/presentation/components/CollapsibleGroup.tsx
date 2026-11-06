import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'

import type { CatalogGroupKind } from '@/domain/model/inventory'

import './collapsibleGroup.css'

type GroupTone = 'tool' | 'consumable' | 'untyped'

export function groupTone(kind: CatalogGroupKind | null): GroupTone {
  if (kind === 'TOOL') return 'tool'
  if (kind === 'CONSUMABLE') return 'consumable'
  return 'untyped'
}

/** Grupos colapsados, recordados por navegador bajo `storageKey`. */
export function useCollapsedGroups(storageKey: string) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })

  const persist = useCallback(
    (next: ReadonlySet<string>) => {
      setCollapsed(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // Sin almacenamiento disponible: el estado vive solo en memoria.
      }
    },
    [storageKey],
  )

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    persist(next)
  }

  const setAll = (ids: readonly string[], value: boolean) => persist(value ? new Set(ids) : new Set())

  return { isCollapsed: (id: string) => collapsed.has(id), toggle, setAll }
}

export function CollapseAllBar({
  ids,
  isCollapsed,
  setAll,
  children,
}: {
  ids: readonly string[]
  isCollapsed: (id: string) => boolean
  setAll: (ids: readonly string[], value: boolean) => void
  children?: ReactNode
}) {
  const allCollapsed = ids.length > 0 && ids.every(isCollapsed)
  const allExpanded = ids.every((id) => !isCollapsed(id))
  return (
    <div className="cgroup-bar">
      <div className="cgroup-bar__info">{children}</div>
      <div className="cgroup-bar__actions">
        <button type="button" className="cgroup-bar__btn" disabled={allExpanded} onClick={() => setAll(ids, false)}>
          <ChevronsUpDown /> Expandir todo
        </button>
        <button type="button" className="cgroup-bar__btn" disabled={allCollapsed} onClick={() => setAll(ids, true)}>
          <ChevronsDownUp /> Contraer todo
        </button>
      </div>
    </div>
  )
}

export function CollapsibleGroup({
  tone,
  icon,
  title,
  meta,
  summary,
  actions,
  editor,
  collapsed,
  onToggle,
  children,
}: {
  tone: GroupTone
  icon: ReactNode
  title: string
  /** Badges bajo el título. */
  meta?: ReactNode
  /** Resumen a la derecha del encabezado (p. ej. totales). */
  summary?: ReactNode
  actions?: ReactNode
  /** Reemplaza título y meta (p. ej. formulario de renombrar); deshabilita el colapso. */
  editor?: ReactNode
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const isCollapsed = collapsed && !editor
  return (
    <article className={`cgroup cgroup--${tone}${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="cgroup__head">
        <span className="cgroup__icon">{icon}</span>
        {editor ?? (
          <button type="button" className="cgroup__toggle" aria-expanded={!isCollapsed} onClick={onToggle}>
            <span className="cgroup__title">
              <h3>{title}</h3>
              {meta ? <span className="cgroup__meta">{meta}</span> : null}
            </span>
            {summary ? <span className="cgroup__summary">{summary}</span> : null}
            <ChevronDown className="cgroup__chevron" aria-hidden />
          </button>
        )}
        {actions}
      </div>
      <div className="cgroup__body" inert={isCollapsed}>
        <div className="cgroup__inner">{children}</div>
      </div>
    </article>
  )
}
