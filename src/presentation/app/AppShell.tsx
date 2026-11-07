import {
  Bell,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  Map,
  Package,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useContainer, useRequiredSession } from '@/application/ContainerContext'
import { useProjects } from '@/application/hooks/useAdmin'
import { useWorkOrders } from '@/application/hooks/useWorkOrders'
import { StockAlertsProvider, useStockAlerts } from '@/application/stockAlerts'
import { isActiveOrder } from '@/domain/map/placeOrders'
import { newStockAlertIds } from '@/domain/model/stockAlert'
import { accountRoleLabel } from '@/presentation/i18n/labels'

import { routes } from './routes'
import { playStockChime, unlockStockChime } from './stockChime'
import { StockAlertsDialog } from './StockAlertsDialog'
import './appShell.css'

type Tone = 'accent' | 'info' | 'caution' | 'success' | 'orange' | 'violet' | 'neutral'
type BadgeKey = 'activeOrders'

interface Destination {
  readonly to: string
  readonly label: string
  readonly icon: typeof Users
  readonly tone: Tone
  readonly badge?: BadgeKey
}

const sections: readonly { title: string; items: readonly Destination[] }[] = [
  {
    title: 'Operación',
    items: [
      { to: routes.crews, label: 'Cuadrillas', icon: Users, tone: 'accent' },
      { to: routes.workOrders, label: 'Órdenes', icon: ClipboardList, tone: 'info', badge: 'activeOrders' },
      { to: routes.externals, label: 'Externos', icon: Map, tone: 'success' },
      { to: routes.duties, label: 'Jornadas', icon: ClipboardCheck, tone: 'caution' },
    ],
  },
  {
    title: 'Recursos',
    items: [
      { to: routes.vehicles, label: 'Vehículos', icon: Truck, tone: 'orange' },
      { to: routes.inventory, label: 'Inventario', icon: Package, tone: 'violet' },
    ],
  },
  {
    title: 'Sistema',
    items: [{ to: routes.admin, label: 'Admin', icon: ShieldCheck, tone: 'neutral' }],
  },
]

const destinations = sections.flatMap((section) => section.items)

function useBadges(): Record<BadgeKey, number> {
  const orders = useWorkOrders()
  const activeOrders = useMemo(() => (orders.data ?? []).filter(isActiveOrder).length, [orders.data])
  return { activeOrders }
}

const CHIME_GAP_MS = 380
const CHIME_CAP = 4

/** Suena una vez por línea nueva. La primera foto, al entrar, no suena. */
function useStockChime() {
  const session = useRequiredSession()
  const { alerts, ready } = useStockAlerts()
  const seen = useRef<ReadonlySet<string> | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const unlock = () => unlockStockChime()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    seen.current = null
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current.length = 0
  }, [session.projectId])

  useEffect(() => {
    const pendingTimers = timers.current
    return () => {
      for (const timer of pendingTimers) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const fresh = newStockAlertIds(seen.current, alerts)
    seen.current = new Set(alerts.map((alert) => alert.kitLineId))
    for (const [index] of fresh.slice(0, CHIME_CAP).entries()) {
      timers.current.push(window.setTimeout(() => playStockChime(), index * CHIME_GAP_MS))
    }
  }, [alerts, ready])
}

export function AppShell() {
  return (
    <StockAlertsProvider>
      <ShellLayout />
    </StockAlertsProvider>
  )
}

function ShellLayout() {
  const badges = useBadges()
  const { alerts } = useStockAlerts()
  const [stockOpen, setStockOpen] = useState(false)
  const openStock = () => setStockOpen(true)
  useStockChime()
  const stockCount = alerts.length

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <img src="/brand/traffic-nexus-dark.png" alt="Traffic Nexus" />
        </div>
        <ProjectSwitcher />
        <nav className="shell__nav" aria-label="Secciones">
          {sections.map((section) => (
            <div key={section.title} className="shell__section">
              <span className="shell__section-title">{section.title}</span>
              {section.items.map((item) => (
                <SideLink key={item.to} item={item} count={item.badge ? badges[item.badge] : 0} />
              ))}
            </div>
          ))}
        </nav>
        {stockCount > 0 ? <StockBell count={stockCount} dock onClick={openStock} /> : null}
        <UserCard />
      </aside>

      <main className="shell__main">
        <Outlet />
      </main>

      <nav className="shell__bottom" aria-label="Secciones">
        {destinations.map((item) => (
          <BottomTab key={item.to} item={item} count={item.badge ? badges[item.badge] : 0} />
        ))}
      </nav>

      {stockCount > 0 ? <StockBell count={stockCount} onClick={openStock} /> : null}
      <StockAlertsDialog open={stockOpen} onClose={() => setStockOpen(false)} />
    </div>
  )
}

function StockBell({ count, dock = false, onClick }: { count: number; dock?: boolean; onClick: () => void }) {
  const label = `${count} ${count === 1 ? 'alerta' : 'alertas'} de stock bajo`
  return (
    <button
      type="button"
      className={dock ? 'stock-bell stock-bell--dock' : 'stock-bell stock-bell--float'}
      aria-label={`Ver ${label}`}
      title="Stock bajo"
      onClick={onClick}
    >
      <span className="stock-bell__icon" aria-hidden>
        <Bell />
        <span className="stock-bell__pulse" />
      </span>
      <span className="stock-bell__text">Stock bajo</span>
      <span className="stock-bell__count">{count}</span>
    </button>
  )
}

function SideLink({ item, count }: { item: Destination; count: number }) {
  const { to, label, icon: Icon, tone } = item
  return (
    <div className={`shell__slot shell__link--${tone}`}>
      <NavLink to={to} className="shell__link">
        <span className="shell__link-icon">
          <Icon />
        </span>
        <span className="shell__link-label">{label}</span>
        {count > 0 ? (
          <span className="shell__badge" title={`${count} abiertas`}>
            {count}
          </span>
        ) : null}
      </NavLink>
    </div>
  )
}

function BottomTab({ item, count }: { item: Destination; count: number }) {
  const { to, label, icon: Icon, tone } = item
  return (
    <div className={`shell__tab-slot shell__link--${tone}`}>
      <NavLink to={to} className="shell__tab">
        <span className="shell__tab-indicator">
          <Icon />
          {count > 0 ? <span className="shell__tab-badge">{count}</span> : null}
        </span>
        <span>{label}</span>
      </NavLink>
    </div>
  )
}

function ProjectSwitcher() {
  const session = useRequiredSession()
  const { session: sessionRepo } = useContainer()
  const projects = useProjects()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const current = projects.data?.find((project) => project.id === session.projectId)
  const list = projects.data ?? []

  return (
    <div className="shell__project" ref={ref}>
      <button
        type="button"
        className="shell__project-btn"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={list.length <= 1}
      >
        <span className="shell__project-icon">
          <Boxes />
        </span>
        <span className="shell__project-text">
          <span className="shell__project-label">Proyecto</span>
          <span className="shell__project-name">{current?.name ?? 'Proyecto'}</span>
        </span>
        {list.length > 1 ? <ChevronDown className="shell__project-chevron" /> : null}
      </button>
      {open ? (
        <div className="menu shell__project-menu" role="listbox">
          {list.map((project) => (
            <button
              key={project.id}
              type="button"
              role="option"
              aria-selected={project.id === session.projectId}
              onClick={() => {
                sessionRepo.switchProject(project.id)
                setOpen(false)
              }}
            >
              <Boxes />
              {project.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function UserCard() {
  const session = useRequiredSession()
  const { session: sessionRepo } = useContainer()
  const navigate = useNavigate()
  const initials = session.user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="shell__user">
      <span className="shell__avatar" aria-hidden>
        {initials || '·'}
      </span>
      <div className="shell__user-text">
        <div className="shell__user-name">{session.user.fullName || session.user.email}</div>
        <div className="shell__user-role">{accountRoleLabel[session.user.accountRole]}</div>
      </div>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        onClick={() => {
          sessionRepo.logout()
          navigate(routes.login, { replace: true })
        }}
      >
        <LogOut />
      </button>
    </div>
  )
}
