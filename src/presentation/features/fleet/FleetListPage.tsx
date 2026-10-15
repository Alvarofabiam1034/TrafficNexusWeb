import { Boxes, ChevronRight, Plus, Trash2, TriangleAlert, Truck } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCreateVehicle, useDeleteVehicle, useVehicles } from '@/application/hooks/useFleet'
import { DomainError, KitQuantityBlockedError, messageOf } from '@/domain/errors'
import type { Vehicle } from '@/domain/model/fleet'
import { formatPlate, normalizePlate, validatePlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { plateErrorText, plural } from '@/presentation/i18n/labels'

import './fleet.css'

export default function FleetListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const isAdmin = useIsAdmin()
  const vehicles = useVehicles()
  const create = useCreateVehicle()
  const remove = useDeleteVehicle()
  const [creating, setCreating] = useState(false)
  const [plate, setPlate] = useState('')
  const [touched, setTouched] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Vehicle | null>(null)
  const [blocked, setBlocked] = useState<Vehicle | null>(null)

  const platesInUse = useMemo(() => new Set((vehicles.data ?? []).map((vehicle) => vehicle.plate)), [vehicles.data])
  const plateError = validatePlate(plate, platesInUse)

  const closeCreate = () => {
    setCreating(false)
    setPlate('')
    setTouched(false)
  }

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (plateError) return
    try {
      await create.mutateAsync(normalizePlate(plate))
      toast.success('Vehículo creado')
      closeCreate()
    } catch (error) {
      toast.error(DomainError.is(error, 'CONFLICT') ? 'Esa placa ya existe' : messageOf(error, 'No se pudo crear'))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const vehicle = pendingDelete
    setPendingDelete(null)
    try {
      await remove.mutateAsync(vehicle.id)
      toast.success('Vehículo eliminado')
    } catch (error) {
      if (error instanceof KitQuantityBlockedError) setBlocked(vehicle)
      else if (DomainError.is(error, 'CONFLICT')) toast.error('La placa está asignada a una cuadrilla')
      else toast.error(messageOf(error, 'No se pudo eliminar'))
    }
  }

  return (
    <>
      <PageHeader title="Vehículos" subtitle="Placas y sus cajas de herramienta" />
      <div className="page-body">
        {vehicles.isPending ? <Loading /> : null}
        {vehicles.isError ? (
          <ErrorState message="No se pudieron cargar los vehículos." onRetry={() => void vehicles.refetch()} />
        ) : null}
        {vehicles.data && vehicles.data.length === 0 ? (
          <EmptyState
            icon={<Truck />}
            title="Sin vehículos"
            body="Registra la placa de cada vehículo. Luego podrás asignarle cajas con los grupos del inventario."
            action={
              isAdmin ? (
                <Button variant="outlined" icon={<Plus />} onClick={() => setCreating(true)}>
                  Nuevo vehículo
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {vehicles.data && vehicles.data.length > 0 ? (
          <>
            <span className="label">{plural(vehicles.data.length, 'vehículo', 'vehículos')}</span>
            <div className="fleet-grid">
              {vehicles.data.map((vehicle) => (
                <article key={vehicle.id} className="card fleet-card">
                  <button type="button" className="fleet-card__main" onClick={() => navigate(routes.vehicle(vehicle.id))}>
                    <span className="icon-badge icon-badge--hi">
                      <Truck />
                    </span>
                    <span className="fleet-card__text">
                      <span className="fleet-card__plate mono">{formatPlate(vehicle.plate)}</span>
                      <span className="muted">
                        <Boxes size={14} /> {plural(vehicle.kits.length, 'caja', 'cajas')}
                      </span>
                    </span>
                    <ChevronRight className="fleet-card__chevron" />
                  </button>
                  {isAdmin ? (
                    <IconButton label={`Eliminar ${formatPlate(vehicle.plate)}`} danger size="sm" onClick={() => setPendingDelete(vehicle)}>
                      <Trash2 />
                    </IconButton>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {isAdmin && vehicles.data ? (
        <button type="button" className="fab" onClick={() => setCreating(true)}>
          <Plus size={20} /> Nuevo vehículo
        </button>
      ) : null}

      <Dialog
        open={creating}
        onClose={closeCreate}
        title="Nuevo vehículo"
        icon={<Truck />}
        locked={create.isPending}
        actions={
          <>
            <Button variant="text" onClick={closeCreate}>
              Cancelar
            </Button>
            <Button type="submit" form="create-vehicle" loading={create.isPending}>
              Crear
            </Button>
          </>
        }
      >
        <form id="create-vehicle" onSubmit={submitCreate} noValidate>
          <TextField
            label="Placa"
            icon={<Truck />}
            placeholder="ABC 123"
            autoComplete="off"
            autoCapitalize="characters"
            value={plate}
            onChange={(event) => setPlate(formatPlate(normalizePlate(event.target.value).slice(0, 6)))}
            error={touched && plateError ? plateErrorText[plateError] : null}
            hint="Vehículos ABC 123 o motocicletas ABC 12D"
          />
        </form>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar vehículo?"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button variant="text" danger icon={<Trash2 />} onClick={() => void confirmDelete()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          Se eliminará la placa {pendingDelete ? formatPlate(pendingDelete.plate) : ''} y sus cajas (todas deben estar en
          cero).
        </p>
      </Dialog>

      <Dialog
        open={blocked !== null}
        onClose={() => setBlocked(null)}
        title="No se puede eliminar"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setBlocked(null)}>
              Cerrar
            </Button>
            {blocked ? (
              <Button
                onClick={() => {
                  navigate(routes.vehicle(blocked.id))
                  setBlocked(null)
                }}
              >
                Ver cajas
              </Button>
            ) : null}
          </>
        }
      >
        <p className="dialog__text">
          La placa {blocked ? formatPlate(blocked.plate) : ''} tiene ítems con cantidad mayor que cero. Deja todas las
          cajas en cero antes de eliminarla.
        </p>
      </Dialog>
    </>
  )
}
