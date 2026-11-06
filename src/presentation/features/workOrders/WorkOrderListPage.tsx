import { ClipboardList, Clock, MapPin, Search, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import { useWorkOrders } from '@/application/hooks/useWorkOrders'
import type { Crew } from '@/domain/model/crew'
import { maxPriority, workOrderStateLabel, type WorkOrder, type WorkOrderState } from '@/domain/model/workOrder'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button } from '@/presentation/components/Button'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import { priorityTone, STATE_TONE, type Tone } from './workOrderTone'
import './workOrders.css'

type Filter = 'ALL' | 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE'

const FILTERS: readonly { key: Filter; label: string; tone: Tone }[] = [
  { key: 'ALL', label: 'Todas', tone: 'accent' },
  { key: 'DRAFT', label: 'Borradores', tone: 'neutral' },
  { key: 'ASSIGNED', label: 'Asignadas', tone: 'info' },
  { key: 'IN_PROGRESS', label: 'En progreso', tone: 'caution' },
  { key: 'DONE', label: 'Finalizadas', tone: 'success' },
]

const MAX_VISIBLE_IDS = 6

function matchesQuery(order: WorkOrder, crew: Crew | undefined, query: string): boolean {
  if (!query) return true
  const haystack = [
    order.externalNumber,
    order.statusReported,
    order.place?.name ?? '',
    crew ? `${crew.vehiclePlate} ${crew.leadTechnician.fullName}` : '',
    ...order.items.flatMap((item) => [item.externalId, item.address, item.equipment]),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export default function WorkOrderListPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const orders = useWorkOrders()
  const crews = useCrews()

  const crewById = useMemo(() => new Map((crews.data ?? []).map((crew) => [crew.id, crew])), [crews.data])
  const query = search.trim().toLowerCase()
  const searched = useMemo(
    () => (orders.data ?? []).filter((order) => matchesQuery(order, order.crewId ? crewById.get(order.crewId) : undefined, query)),
    [orders.data, crewById, query],
  )
  const countOf = (key: Filter) => (key === 'ALL' ? searched.length : searched.filter((order) => order.state === key).length)
  const visible = filter === 'ALL' ? searched : searched.filter((order) => order.state === (filter as WorkOrderState))

  return (
    <>
      <PageHeader title="Órdenes" subtitle="Borradores, asignaciones y cierres" />
      <div className="page-body">
        {orders.isPending ? <Loading /> : null}
        {orders.isError ? (
          <ErrorState message="No se pudieron cargar las órdenes." onRetry={() => void orders.refetch()} />
        ) : null}

        {orders.data && orders.data.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="Aún no hay órdenes"
            body="Abre un punto en Externos y pulsa Asignar OT para crear una orden anclada al mapa."
            action={
              isAdmin ? (
                <Button variant="outlined" icon={<MapPin />} onClick={() => navigate(routes.externals)}>
                  Ir a Externos
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {orders.data && orders.data.length > 0 ? (
          <>
            <div className="wo-stats" role="tablist" aria-label="Filtrar por estado">
              {FILTERS.map((item) => {
                const active = filter === item.key
                const count = countOf(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`wo-stat wo-stat--${item.tone}${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                    onClick={() => setFilter(item.key)}
                  >
                    <span className="wo-stat__value">{count}</span>
                    <span className="wo-stat__label">{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="wo-toolbar">
              <label className="wo-search">
                <Search aria-hidden />
                <input
                  type="search"
                  placeholder="Buscar por externo, ID, dirección, placa o técnico…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Buscar órdenes"
                />
                {search ? (
                  <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>
                    <X />
                  </button>
                ) : null}
              </label>
              <span className="wo-toolbar__count">{plural(visible.length, 'orden', 'órdenes')}</span>
            </div>

            {visible.length === 0 ? (
              <div className="wo-empty">
                <ClipboardList />
                <span>{query ? 'Ninguna orden coincide con la búsqueda.' : 'No hay órdenes en este estado.'}</span>
              </div>
            ) : (
              <div className="wo-grid">
                {visible.map((order) => (
                  <WorkOrderCard
                    key={order.id}
                    order={order}
                    crew={order.crewId ? crewById.get(order.crewId) : undefined}
                    onOpen={() => navigate(routes.workOrder(order.id))}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}

function WorkOrderCard({ order, crew, onOpen }: { order: WorkOrder; crew: Crew | undefined; onOpen: () => void }) {
  const tone = STATE_TONE[order.state]
  const priority = maxPriority(order.items)
  const when = order.closedAt ?? order.assignedAt ?? order.createdAt
  const placeLabel = order.place?.name?.trim() || null
  const actorLabel =
    order.state === 'DONE'
      ? `Cerrada por ${order.closedByName || '—'}`
      : order.state === 'ASSIGNED' || order.state === 'IN_PROGRESS'
        ? `Asignada por ${order.assignedByName || '—'}`
        : `Creada por ${order.createdByName || '—'}`
  const shownIds = order.items.slice(0, MAX_VISIBLE_IDS)
  const hiddenIds = order.items.length - shownIds.length

  return (
    <button type="button" className={`wo-card wo-card--${tone}`} onClick={onOpen}>
      <div className="wo-card__head">
        <div className="wo-card__title">
          <span className="wo-card__label">Externo</span>
          <span className="wo-card__number">{order.externalNumber || '—'}</span>
        </div>
        <div className="wo-card__chips">
          <span className={`tone-pill tone-pill--dot tone-pill--${tone}`}>{workOrderStateLabel(order.state)}</span>
          {priority ? <span className={`tone-pill tone-pill--${priorityTone(priority)}`}>{priority}</span> : null}
        </div>
      </div>

      {order.statusReported ? <div className="wo-card__status">{order.statusReported}</div> : null}

      <div className={`wo-card__place${placeLabel ? '' : ' is-missing'}`}>
        <MapPin aria-hidden />
        <span>{placeLabel ?? 'Sin ubicación'}</span>
      </div>

      {order.items.length > 0 ? (
        <div className="wo-card__ids">
          {shownIds.map((item) => (
            <span key={item.id || item.externalId} className="wo-id">
              {item.externalId || '—'}
            </span>
          ))}
          {hiddenIds > 0 ? <span className="wo-id wo-id--more">+{hiddenIds}</span> : null}
        </div>
      ) : null}

      <div className="wo-card__foot">
        <span className="wo-card__crew">
          <Users aria-hidden />
          {crew ? (
            <>
              <span className="plate-tag">{formatPlate(crew.vehiclePlate)}</span>
              <span className="wo-card__crew-name">{crew.leadTechnician.fullName}</span>
            </>
          ) : (
            <span className="muted">{order.crewId ? 'Cuadrilla' : 'Sin cuadrilla'}</span>
          )}
        </span>
        <span className="wo-card__when">
          <span className="wo-card__when-date">
            <Clock aria-hidden />
            {when ? formatDateTime(when) : '—'}
          </span>
          <span className="wo-card__actor">{actorLabel}</span>
        </span>
      </div>
    </button>
  )
}
