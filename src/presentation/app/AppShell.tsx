import { Boxes, ChevronDown, ClipboardList, LogOut, Map, Package, ShieldCheck, Truck, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useContainer, useRequiredSession } from '@/application/ContainerContext'
import { useProjects } from '@/application/hooks/useAdmin'
import { accountRoleLabel } from '@/presentation/i18n/labels'

import { routes } from './routes'
import './appShell.css'

const destinations = [
  { to: routes.crews, label: 'Cuadrillas', icon: Users },
  { to: routes.workOrders, label: 'Órdenes', icon: ClipboardList },
  { to: routes.vehicles, label: 'Vehículos', icon: Truck },
  { to: routes.inventory, label: 'Inventario', icon: Package },
  { to: routes.externals, label: 'Externos', icon: Map },
  { to: routes.admin, label: 'Admin', icon: ShieldCheck },
] as const

export function AppShell() {
  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <img src="/brand/traffic-nexus-dark.png" alt="Traffic Nexus" />
        </div>
        <ProjectSwitcher />
        <nav className="shell__nav" aria-label="Secciones">
          {destinations.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="shell__link">
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <UserCard />
      </aside>

      <main className="shell__main">
        <Outlet />
      </main>

      <nav className="shell__bottom" aria-label="Secciones">
        {destinations.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="shell__tab">
            <span className="shell__tab-indicator">
              <Icon />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
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
        <Boxes />
        <span className="shell__project-name">{current?.name ?? 'Proyecto'}</span>
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
