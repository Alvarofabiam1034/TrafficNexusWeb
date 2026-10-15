import { Check, Info, Smartphone, Truck, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews, useProjectMembers, useSaveCrew } from '@/application/hooks/useCrews'
import { useVehicles } from '@/application/hooks/useFleet'
import { DomainError, messageOf } from '@/domain/errors'
import { CREW_ROLES, memberFor, type Crew, type CrewRole } from '@/domain/model/crew'
import type { ProjectMember } from '@/domain/model/user'
import type { Vehicle } from '@/domain/model/fleet'
import { blockedPlates } from '@/domain/schedule/scheduleRules'
import {
  formatPhone,
  formatPlate,
  normalizePhone,
  validatePhone,
  type PhoneError,
  type PlateError,
} from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button } from '@/presentation/components/Button'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { phoneErrorText, plateErrorText, roleLabel } from '@/presentation/i18n/labels'

import { roleIcon } from './roleIcons'
import './crews.css'

export default function CrewFormPage() {
  const { crewId } = useParams<{ crewId: string }>()
  const isAdmin = useIsAdmin()
  const crews = useCrews()
  const members = useProjectMembers()
  const vehicles = useVehicles()

  if (!isAdmin) return <Navigate to={routes.crews} replace />
  if (crews.isPending || members.isPending || vehicles.isPending) return <Loading />
  if (crews.isError || members.isError || vehicles.isError) {
    return <ErrorState message="No se pudo cargar la información para la cuadrilla." />
  }
  const editing = crewId ? (crews.data.find((crew) => crew.id === crewId) ?? null) : null
  if (crewId && !editing) return <Navigate to={routes.crews} replace />

  return <CrewForm crews={crews.data} editing={editing} members={members.data} vehicles={vehicles.data} />
}

type MemberSelection = Record<CrewRole, string>
type MemberError = 'REQUIRED' | 'DUPLICATED_IN_CREW'

const memberErrorText: Record<MemberError, string> = {
  REQUIRED: 'Selecciona una persona',
  DUPLICATED_IN_CREW: 'Esta persona ya ocupa otro rol de la cuadrilla',
}

function CrewForm({
  crews,
  editing,
  members,
  vehicles,
}: {
  crews: readonly Crew[]
  editing: Crew | null
  members: readonly ProjectMember[]
  vehicles: readonly Vehicle[]
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveCrew()

  const [selection, setSelection] = useState<MemberSelection>({
    LEAD_TECHNICIAN: editing?.leadTechnician.userId ?? '',
    AUXILIARY_TECHNICIAN: editing?.auxiliaryTechnician.userId ?? '',
    BOOM_OPERATOR: editing?.boomOperator.userId ?? '',
  })
  const [phone, setPhone] = useState(editing ? formatPhone(editing.corporatePhone) : '')
  const [vehicleId, setVehicleId] = useState(editing?.vehicleId ?? '')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const others = useMemo(() => crews.filter((crew) => crew.id !== editing?.id), [crews, editing])

  const phonesInUse = useMemo(() => new Set(others.map((crew) => crew.corporatePhone)), [others])
  const phoneError: PhoneError | null = validatePhone(phone, phonesInUse)

  // Placas que esta cuadrilla no puede tomar por el relevo con otra cuadrilla.
  const plateBlocks = useMemo(
    () =>
      blockedPlates(
        editing?.shifts ?? [],
        others,
        vehicles.map((vehicle) => vehicle.plate),
      ),
    [editing, others, vehicles],
  )
  const sharedPlates = useMemo(() => new Set(others.map((crew) => crew.vehiclePlate)), [others])
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null
  const plateError: PlateError | null = !selectedVehicle
    ? 'REQUIRED'
    : (plateBlocks.get(selectedVehicle.plate) ?? null)

  const memberErrors = useMemo(() => {
    const errors = new Map<CrewRole, MemberError>()
    const seen = new Set<string>()
    for (const role of CREW_ROLES) {
      const value = selection[role]
      if (!value) {
        errors.set(role, 'REQUIRED')
        continue
      }
      if (seen.has(value)) errors.set(role, 'DUPLICATED_IN_CREW')
      else seen.add(value)
    }
    return errors
  }, [selection])

  const isValid = memberErrors.size === 0 && phoneError === null && plateError === null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    setServerError(null)
    if (!isValid) return
    try {
      await save.mutateAsync({
        crewId: editing?.id ?? null,
        draft: {
          leadUserId: selection.LEAD_TECHNICIAN,
          auxiliaryUserId: selection.AUXILIARY_TECHNICIAN,
          boomUserId: selection.BOOM_OPERATOR,
          corporatePhone: normalizePhone(phone),
          vehicleId,
        },
      })
      toast.success(editing ? 'Cuadrilla actualizada' : 'Cuadrilla creada')
      navigate(routes.crews, { replace: true })
    } catch (error) {
      if (DomainError.is(error, 'CONFLICT')) {
        setServerError('Alguien ya usa ese celular, esa persona o esa placa en otra cuadrilla.')
      } else {
        setServerError(messageOf(error, 'No se pudo guardar la cuadrilla'))
      }
    }
  }

  return (
    <>
      <PageHeader title={editing ? 'Editar cuadrilla' : 'Nueva cuadrilla'} backTo={routes.crews} />
      <form className="page-body" onSubmit={submit} noValidate>
        <div className="form-grid">
          <section className="card form-section">
            <div className="row">
              <Users size={18} color="var(--brand-accent)" />
              <h3>Integrantes</h3>
            </div>
            <p className="form-section__hint">
              Solo aparecen usuarios del proyecto con ese cargo. Quien ya está en otra cuadrilla se muestra como
              ocupado.
            </p>
            {CREW_ROLES.map((role) => {
              const Icon = roleIcon[role]
              const error = touched ? memberErrors.get(role) : undefined
              const current = editing ? memberFor(editing, role).userId : null
              const candidates = members.filter((member) => member.crewRole === role)
              return (
                <SelectField
                  key={role}
                  label={roleLabel[role]}
                  icon={<Icon />}
                  value={selection[role]}
                  onChange={(event) => setSelection((prev) => ({ ...prev, [role]: event.target.value }))}
                  error={error ? memberErrorText[error] : null}
                  placeholder={candidates.length === 0 ? 'No hay personas con este cargo' : 'Selecciona…'}
                  disabled={candidates.length === 0}
                >
                  {candidates.map((member) => {
                    const takenElsewhere = member.crewId !== null && member.userId !== current
                    return (
                      <option key={member.userId} value={member.userId} disabled={takenElsewhere}>
                        {member.fullName}
                        {takenElsewhere ? ' · en otra cuadrilla' : ''}
                      </option>
                    )
                  })}
                </SelectField>
              )
            })}
          </section>

          <section className="card form-section">
            <div className="row">
              <Truck size={18} color="var(--brand-accent)" />
              <h3>Recursos</h3>
            </div>
            <TextField
              label="Celular corporativo"
              icon={<Smartphone />}
              prefix="+57"
              inputMode="numeric"
              autoComplete="off"
              placeholder="300 123 4567"
              value={phone}
              onChange={(event) => setPhone(formatPhone(normalizePhone(event.target.value).slice(0, 10)))}
              error={touched && phoneError ? phoneErrorText[phoneError] : null}
            />
            <SelectField
              label="Vehículo"
              icon={<Truck />}
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              placeholder="Selecciona la placa…"
              error={touched && plateError ? plateErrorText[plateError] : null}
              hint={
                selectedVehicle && sharedPlates.has(selectedVehicle.plate) && !plateError
                  ? 'Esta placa la comparte otra cuadrilla. El relevo máximo es de una hora.'
                  : undefined
              }
            >
              {vehicles.map((vehicle) => {
                const block = plateBlocks.get(vehicle.plate)
                const shared = sharedPlates.has(vehicle.plate)
                return (
                  <option key={vehicle.id} value={vehicle.id} disabled={block !== undefined}>
                    {formatPlate(vehicle.plate)}
                    {block ? ' · turnos cruzados' : shared ? ' · compartida' : ''}
                  </option>
                )
              })}
            </SelectField>
            {!editing ? (
              <InlineMessage kind="info" icon={<Info />}>
                El horario se define después de crear la cuadrilla, desde la tarjeta.
              </InlineMessage>
            ) : null}
          </section>
        </div>

        {serverError ? <InlineMessage>{serverError}</InlineMessage> : null}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="text" onClick={() => navigate(routes.crews)}>
            Cancelar
          </Button>
          <Button type="submit" icon={<Check />} loading={save.isPending} disabled={touched && !isValid}>
            {editing ? 'Guardar cambios' : 'Crear cuadrilla'}
          </Button>
        </div>
      </form>
    </>
  )
}
