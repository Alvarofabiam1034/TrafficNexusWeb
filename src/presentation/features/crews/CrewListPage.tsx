import { CalendarDays, Clock, Pencil, Plus, Smartphone, Trash2, TriangleAlert, Truck, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews, useDeleteCrew, useProjectMembers } from '@/application/hooks/useCrews'
import { useVehicles } from '@/application/hooks/useFleet'
import { messageOf } from '@/domain/errors'
import { CREW_ROLES, memberFor, type Crew } from '@/domain/model/crew'
import { today } from '@/domain/schedule/civilDate'
import { shiftsForCard } from '@/domain/schedule/scheduleRules'
import { formatPhone, formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { roleLabel } from '@/presentation/i18n/labels'
import { shiftSummary } from '@/presentation/i18n/shiftText'

import { roleIcon } from './roleIcons'
import './crews.css'

type CreateBlock = 'NEEDS_PEOPLE' | 'NEEDS_VEHICLES' | null

export default function CrewListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const isAdmin = useIsAdmin()
  const crews = useCrews()
  const members = useProjectMembers()
  const vehicles = useVehicles()
  const deleteCrew = useDeleteCrew()
  const [pendingDelete, setPendingDelete] = useState<Crew | null>(null)
  const [block, setBlock] = useState<CreateBlock>(null)

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
            <span className="label">{crews.data.length} registradas</span>
            <div className="crew-grid">
              {crews.data.map((crew, index) => (
                <CrewCard
                  key={crew.id}
                  number={index + 1}
                  crew={crew}
                  canEdit={isAdmin}
                  onEdit={() => navigate(routes.crewEdit(crew.id))}
                  onSchedule={() => navigate(routes.crewSchedule(crew.id))}
                  onDelete={() => setPendingDelete(crew)}
                />
              ))}
            </div>
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

function CrewCard({
  number,
  crew,
  canEdit,
  onEdit,
  onSchedule,
  onDelete,
}: {
  number: number
  crew: Crew
  canEdit: boolean
  onEdit: () => void
  onSchedule: () => void
  onDelete: () => void
}) {
  const visible = shiftsForCard(crew.shifts, today())
  const shown = visible.slice(0, 4)
  const hidden = visible.length - shown.length

  return (
    <article className="card crew-card">
      <div className="crew-card__head">
        <span className="icon-badge icon-badge--hi">
          <Users />
        </span>
        <div className="crew-card__info">
          <h3>Cuadrilla {number}</h3>
          <div className="crew-card__line">
            <Smartphone aria-label="Celular corporativo" />
            <span>+57 {formatPhone(crew.corporatePhone)}</span>
          </div>
          <div className="crew-card__line">
            <Truck aria-label="Placa del vehículo" />
            <span className="mono">{formatPlate(crew.vehiclePlate)}</span>
          </div>
          <div className="crew-card__schedule">
            {visible.length === 0 ? (
              <span className="muted">Sin horario</span>
            ) : (
              <>
                {shown.map((shift) => (
                  <span key={shift.id} className="muted">
                    {shiftSummary(shift)}
                  </span>
                ))}
                {hidden > 0 ? <span className="muted">y {hidden} más</span> : null}
              </>
            )}
          </div>
          <Button variant="text" size="sm" icon={<Clock />} onClick={onSchedule}>
            Horario
          </Button>
        </div>
      </div>
      <hr className="card__divider" />
      <div className="crew-card__members">
        {CREW_ROLES.map((role) => {
          const Icon = roleIcon[role]
          const member = memberFor(crew, role)
          return (
            <div key={role} className="crew-card__member">
              <span className="icon-badge">
                <Icon />
              </span>
              <div>
                <div className="label">{roleLabel[role]}</div>
                <div className="crew-card__name">{member.fullName || '—'}</div>
              </div>
            </div>
          )
        })}
      </div>
      {canEdit ? (
        <>
          <hr className="card__divider" />
          <div className="crew-card__actions">
            <Button variant="text" size="sm" icon={<Pencil />} onClick={onEdit}>
              Editar
            </Button>
            <Button variant="text" size="sm" danger icon={<Trash2 />} onClick={onDelete}>
              Eliminar
            </Button>
          </div>
        </>
      ) : null}
    </article>
  )
}
