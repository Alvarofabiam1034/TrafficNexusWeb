import { CalendarDays, Clock, Pencil, Plus, Smartphone, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews, useDeleteCrew, useProjectMembers } from '@/application/hooks/useCrews'
import { useVehicles } from '@/application/hooks/useFleet'
import { messageOf } from '@/domain/errors'
import { CREW_ROLES, memberFor, type Crew, type CrewRole } from '@/domain/model/crew'
import { today } from '@/domain/schedule/civilDate'
import { isOnShiftAt, shiftsForCard } from '@/domain/schedule/scheduleRules'
import { formatPhone, formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { useNow } from '@/presentation/components/useNow'
import { roleLabel } from '@/presentation/i18n/labels'
import { shiftSummary } from '@/presentation/i18n/shiftText'

import { roleIcon } from './roleIcons'
import './crews.css'

type CreateBlock = 'NEEDS_PEOPLE' | 'NEEDS_VEHICLES' | null
type Availability = 'ON' | 'OFF' | 'NONE'
type Filter = 'ALL' | Availability

const FILTERS: readonly { key: Filter; label: string; tone: string }[] = [
  { key: 'ALL', label: 'Cuadrillas', tone: 'accent' },
  { key: 'ON', label: 'En turno ahora', tone: 'success' },
  { key: 'OFF', label: 'Fuera de turno', tone: 'neutral' },
  { key: 'NONE', label: 'Sin horario', tone: 'caution' },
]

const ROLE_TONE: Record<CrewRole, string> = {
  LEAD_TECHNICIAN: 'accent',
  AUXILIARY_TECHNICIAN: 'info',
  BOOM_OPERATOR: 'orange',
}

const MAX_SHIFTS = 4

function availabilityOf(crew: Crew, now: Date): Availability {
  if (crew.shifts.length === 0) return 'NONE'
  return isOnShiftAt(crew, now) ? 'ON' : 'OFF'
}

export default function CrewListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const isAdmin = useIsAdmin()
  const crews = useCrews()
  const members = useProjectMembers()
  const vehicles = useVehicles()
  const deleteCrew = useDeleteCrew()
  const now = useNow()
  const [pendingDelete, setPendingDelete] = useState<Crew | null>(null)
  const [block, setBlock] = useState<CreateBlock>(null)
  const [filter, setFilter] = useState<Filter>('ALL')

  const requestCreate = () => {
    const people = members.data ?? []
    const hasAllRoles = CREW_ROLES.every((role) => people.some((member) => member.crewRole === role))
    if (!hasAllRoles) return setBlock('NEEDS_PEOPLE')
    if ((vehicles.data ?? []).length === 0) return setBlock('NEEDS_VEHICLES')
    navigate(routes.crewNew)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const crew = pendingDelete
    setPendingDelete(null)
    try {
      await deleteCrew.mutateAsync(crew.id)
      toast.success('Cuadrilla eliminada')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo eliminar la cuadrilla'))
    }
  }

  const entries = (crews.data ?? []).map((crew, index) => ({ crew, number: index + 1, availability: availabilityOf(crew, now) }))
  const countOf = (key: Filter) => (key === 'ALL' ? entries.length : entries.filter((entry) => entry.availability === key).length)
  const visible = filter === 'ALL' ? entries : entries.filter((entry) => entry.availability === filter)

  return (
    <>
      <PageHeader
        title="Cuadrillas"
        subtitle="Mantenimiento de semaforización · Bogotá"
        actions={
          <IconButton label="Ver la semana" onClick={() => navigate(routes.week)}>
            <CalendarDays />
          </IconButton>
        }
      />
      <div className="page-body">
        {crews.isPending ? <Loading /> : null}
        {crews.isError ? (
          <ErrorState message="No se pudieron cargar las cuadrillas." onRetry={() => void crews.refetch()} />
        ) : null}
        {crews.data && crews.data.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Aún no hay cuadrillas"
            body="Crea la primera cuadrilla con su técnico líder, técnico auxiliar, operador de brazo articulado, celular corporativo y placa del vehículo."
            action={
              isAdmin ? (
                <Button variant="outlined" icon={<Plus />} onClick={requestCreate}>
                  Nueva cuadrilla
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {crews.data && crews.data.length > 0 ? (
          <>
            <div className="crew-stats" role="tablist" aria-label="Filtrar cuadrillas por turno">
              {FILTERS.map((item) => {
                const active = filter === item.key
                const count = countOf(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`crew-stat crew-stat--${item.tone}${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                    onClick={() => setFilter(item.key)}
                  >
                    <span className="crew-stat__value">{count}</span>
                    <span className="crew-stat__label">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {visible.length === 0 ? (
              <div className="crew-empty">No hay cuadrillas en este estado.</div>
            ) : (
              <div className="crew-grid">
                {visible.map((entry) => (
                  <CrewCard
                    key={entry.crew.id}
                    number={entry.number}
                    crew={entry.crew}
                    availability={entry.availability}
                    canEdit={isAdmin}
                    onEdit={() => navigate(routes.crewEdit(entry.crew.id))}
                    onSchedule={() => navigate(routes.crewSchedule(entry.crew.id))}
                    onDelete={() => setPendingDelete(entry.crew)}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {isAdmin && crews.data ? (
        <button type="button" className="fab" onClick={requestCreate}>
          <Plus size={20} /> Nueva cuadrilla
        </button>
      ) : null}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar cuadrilla?"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button variant="text" danger icon={<Trash2 />} onClick={() => void confirmDelete()}>
              Sí, eliminar
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          Se eliminará la cuadrilla liderada por {pendingDelete?.leadTechnician.fullName}. Esta acción no se puede
          deshacer.
        </p>
      </Dialog>

      <Dialog
        open={block !== null}
        onClose={() => setBlock(null)}
        title={block === 'NEEDS_PEOPLE' ? 'Primero registra las personas' : 'Primero crea un vehículo'}
        actions={
          <Button variant="text" onClick={() => setBlock(null)}>
            Entendido
          </Button>
        }
      >
        <p className="dialog__text">
          {block === 'NEEDS_PEOPLE'
            ? 'Una cuadrilla se arma con usuarios que ya existen y que cubran los tres cargos. Regístralos en Admin y vuelve a crear la cuadrilla.'
            : 'La cuadrilla necesita una placa. Créala en Vehículos y vuelve a intentarlo.'}
        </p>
      </Dialog>
    </>
  )
}

const AVAILABILITY_PILL: Record<Availability, { label: string; tone: string }> = {
  ON: { label: 'En turno', tone: 'success' },
  OFF: { label: 'Fuera de turno', tone: 'neutral' },
  NONE: { label: 'Sin horario', tone: 'caution' },
}

function CrewCard({
  number,
  crew,
  availability,
  canEdit,
  onEdit,
  onSchedule,
  onDelete,
}: {
  number: number
  crew: Crew
  availability: Availability
  canEdit: boolean
  onEdit: () => void
  onSchedule: () => void
  onDelete: () => void
}) {
  const visible = shiftsForCard(crew.shifts, today())
  const shown = visible.slice(0, MAX_SHIFTS)
  const hidden = visible.length - shown.length
  const pill = AVAILABILITY_PILL[availability]

  return (
    <article className={`crew-card crew-card--${availability.toLowerCase()}`}>
      <header className="crew-card__head">
        <span className="crew-card__number" aria-hidden>
          {number}
        </span>
        <div className="crew-card__title">
          <h3>Cuadrilla {number}</h3>
          <span className={`tone-pill tone-pill--${pill.tone}`}>
            {availability === 'ON' ? <span className="crew-pulse" aria-hidden /> : null}
            {pill.label}
          </span>
        </div>
        <span className="plate-tag plate-tag--lg" title="Placa del vehículo">
          {formatPlate(crew.vehiclePlate)}
        </span>
      </header>

      <a className="crew-card__phone" href={`tel:+57${crew.corporatePhone}`}>
        <Smartphone aria-hidden />
        <span>+57 {formatPhone(crew.corporatePhone)}</span>
        <span className="crew-card__phone-hint">Celular corporativo</span>
      </a>

      <ul className="crew-card__members">
        {CREW_ROLES.map((role) => {
          const Icon = roleIcon[role]
          const member = memberFor(crew, role)
          return (
            <li key={role} className={`crew-member crew-member--${ROLE_TONE[role]}`}>
              <span className="crew-member__icon">
                <Icon />
              </span>
              <div className="crew-member__text">
                <span className="crew-member__role">{roleLabel[role]}</span>
                <span className="crew-member__name">{member.fullName || '—'}</span>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="crew-card__schedule">
        <div className="crew-card__schedule-head">
          <Clock aria-hidden />
          <span>Horario</span>
        </div>
        {visible.length === 0 ? (
          <span className="crew-card__no-shift">Sin horario asignado</span>
        ) : (
          <div className="crew-card__shifts">
            {shown.map((shift) => (
              <span key={shift.id} className={`crew-shift${shift.date ? ' crew-shift--dated' : ''}`}>
                {shiftSummary(shift)}
              </span>
            ))}
            {hidden > 0 ? <span className="crew-shift crew-shift--more">+{hidden} más</span> : null}
          </div>
        )}
      </div>

      <footer className="crew-card__actions">
        <Button variant="tonal" size="sm" icon={<Clock />} onClick={onSchedule}>
          Horario
        </Button>
        {canEdit ? (
          <>
            <Button variant="text" size="sm" icon={<Pencil />} onClick={onEdit}>
              Editar
            </Button>
            <IconButton label={`Eliminar cuadrilla ${number}`} size="sm" danger onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </>
        ) : null}
      </footer>
    </article>
  )
}
