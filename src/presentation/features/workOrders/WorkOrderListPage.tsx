import { ClipboardList, MapPin, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews } from '@/application/hooks/useCrews'
import { useWorkOrders } from '@/application/hooks/useWorkOrders'
import { maxPriority, type WorkOrder, type WorkOrderState } from '@/domain/model/workOrder'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button } from '@/presentation/components/Button'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import './workOrders.css'

type Filter = 'ALL' | 'DRAFT' | 'ASSIGNED'

export default function WorkOrderListPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const [filter, setFilter] = useState<Filter>('ALL')
  const state: WorkOrderState | undefined = filter === 'ALL' ? undefined : filter
  const orders = useWorkOrders(state)
  const crews = useCrews()

  const crewLabel = (crewId: string | null): string => {
    if (!crewId) return 'Sin cuadrilla'
    const crew = crews.data?.find((item) => item.id === crewId)
    if (!crew) return 'Cuadrilla'
    return `${formatPlate(crew.vehiclePlate)} · ${crew.leadTechnician.fullName}`
  }

  return (
    <>
      <PageHeader title="Órdenes" subtitle="Borradores y asignaciones a cuadrillas" />
      <div className="page-body">
        <div className="ot-filters" role="tablist" aria-label="Filtrar por estado">
          {(
            [
              ['ALL', 'Todas'],
              ['DRAFT', 'Borradores'],
              ['ASSIGNED', 'Asignadas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={['ot-filter', filter === value ? 'ot-filter--on' : ''].join(' ')}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {orders.isPending ? <Loading /> : null}
        {orders.isError ? (
          <ErrorState message="No se pudieron cargar las órdenes." onRetry={() => void orders.refetch()} />
        ) : null}
        {orders.data && orders.data.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title={filter === 'DRAFT' ? 'No hay borradores' : 'Aún no hay órdenes'}
            body={
              filter === 'ASSIGNED'
                ? 'Cuando asignes una OT a una cuadrilla aparecerá aquí.'
                : 'Abre un punto en Externos y pulsa Asignar OT para crear una orden anclada al mapa.'
            }
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
            <span className="label">
              {orders.data.length} {plural(orders.data.length, 'orden', 'órdenes')}
            </span>
            <div className="ot-list">
              {orders.data.map((order) => (
                <WorkOrderCard
                  key={order.id}
                  order={order}
                  crewLabel={crewLabel(order.crewId)}
                  onOpen={() => navigate(routes.workOrder(order.id))}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

function WorkOrderCard({
  order,
  crewLabel,
  onOpen,
}: {
  order: WorkOrder
  crewLabel: string
  onOpen: () => void
}) {
  const priority = maxPriority(order.items)
  const when = order.assignedAt ?? order.createdAt
  const placeLabel = order.place?.name?.trim() || null
  return (
    <button type="button" className="ot-card" onClick={onOpen}>
      <div className="ot-card__head">
        <div>
          <div className="ot-card__title">
            {order.externalNumber ? `Externo ${order.externalNumber}` : 'Sin externo'}
          </div>
          <div className="ot-card__meta" style={{ marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} /> {crewLabel}
            </span>
            <span>{when ? formatDateTime(when) : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <span className={['ot-chip', order.state === 'DRAFT' ? 'ot-chip--draft' : ''].join(' ')}>
            {order.state === 'DRAFT' ? 'Borrador' : order.state === 'ASSIGNED' ? 'Asignada' : order.state}
          </span>
          {order.statusReported ? <span className="ot-chip ot-chip--status">{order.statusReported}</span> : null}
          {priority ? <span className="ot-chip ot-chip--priority">{priority}</span> : null}
          {!order.place ? <span className="ot-chip ot-chip--draft">Sin ubicación</span> : null}
        </div>
      </div>
      <div className="ot-card__meta">
        <span>
          {order.items.length} {plural(order.items.length, 'ID', 'IDs')}
          {order.items.length > 0 ? `: ${order.items.map((item) => item.externalId).join(', ')}` : ''}
        </span>
        <span>
          {order.state === 'ASSIGNED' ? `por ${order.assignedByName || '—'}` : `creada por ${order.createdByName || '—'}`}
        </span>
      </div>
      {placeLabel ? (
        <div className="ot-card__place">
          <MapPin size={14} />
          <span className="ot-card__place-text">{placeLabel}</span>
        </div>
      ) : null}
    </button>
  )
}
