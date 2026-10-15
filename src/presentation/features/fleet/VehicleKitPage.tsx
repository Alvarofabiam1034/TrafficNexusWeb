import {
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  History,
  Info,
  MinusCircle,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import {
  useAdjustLine,
  useAssignKit,
  useCheckTool,
  useConsumeLine,
  useMovements,
  useReassignKit,
  useRemoveKit,
  useRenameVehicle,
  useToolChecks,
  useVehicle,
  useVehicles,
} from '@/application/hooks/useFleet'
import { useInventory } from '@/application/hooks/useInventory'
import { DomainError, messageOf } from '@/domain/errors'
import { deletionBlocked } from '@/domain/kit/kitRules'
import type { KitLine, Vehicle, VehicleKit } from '@/domain/model/fleet'
import type { InventoryGroup } from '@/domain/model/inventory'
import { formatPlate, normalizePlate, validatePlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Stepper } from '@/presentation/components/Stepper'
import { useToast } from '@/presentation/components/Toast'
import { formatDateTime, kindLabel, plateErrorText, plural } from '@/presentation/i18n/labels'

import './fleet.css'

type Tab = 'KITS' | 'MOVEMENTS' | 'CHECKS'

export default function VehicleKitPage() {
  const { vehicleId = '' } = useParams<{ vehicleId: string }>()
  const vehicle = useVehicle(vehicleId)

  if (vehicle.isPending) return <Loading />
  if (vehicle.isError) {
    if (DomainError.is(vehicle.error, 'NOT_FOUND')) return <Navigate to={routes.vehicles} replace />
    return <ErrorState message="No se pudo cargar el vehículo." onRetry={() => void vehicle.refetch()} />
  }
  return <VehicleDetail vehicle={vehicle.data} />
}

function VehicleDetail({ vehicle }: { vehicle: Vehicle }) {
  const isAdmin = useIsAdmin()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('KITS')
  const [assigning, setAssigning] = useState(false)
  const [renaming, setRenaming] = useState(0) // 0 = cerrado; otro valor remonta el diálogo limpio
  const [pendingRemove, setPendingRemove] = useState<VehicleKit | null>(null)
  const [reassigning, setReassigning] = useState<VehicleKit | null>(null)
  const removeKit = useRemoveKit()

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const kit = pendingRemove
    setPendingRemove(null)
    try {
      await removeKit.mutateAsync({ vehicleId: vehicle.id, kitId: kit.id })
      toast.success('Caja retirada')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo retirar la caja'))
    }
  }

  return (
    <>
      <PageHeader
        title={formatPlate(vehicle.plate)}
        subtitle={plural(vehicle.kits.length, 'caja asignada', 'cajas asignadas')}
        backTo={routes.vehicles}
        actions={
          isAdmin ? (
            <>
              <IconButton label="Cambiar placa" onClick={() => setRenaming(Date.now())}>
                <Pencil />
              </IconButton>
              <IconButton label="Asignar grupo" accent onClick={() => setAssigning(true)}>
                <Plus />
              </IconButton>
            </>
          ) : undefined
        }
      />
      <div className="page-body">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'KITS'} onClick={() => setTab('KITS')}>
            <Boxes size={16} /> Cajas
          </button>
          <button type="button" role="tab" aria-selected={tab === 'MOVEMENTS'} onClick={() => setTab('MOVEMENTS')}>
            <History size={16} /> Movimientos
          </button>
          <button type="button" role="tab" aria-selected={tab === 'CHECKS'} onClick={() => setTab('CHECKS')}>
            <CheckCircle2 size={16} /> Chequeos
          </button>
        </div>

        {tab === 'KITS' ? (
          vehicle.kits.length === 0 ? (
            <EmptyState
              icon={<Boxes />}
              title="Sin cajas"
              body="Asigna un grupo del inventario a esta placa para llevar las cantidades de cada ítem."
              action={
                isAdmin ? (
                  <Button variant="outlined" icon={<Plus />} onClick={() => setAssigning(true)}>
                    Asignar grupo
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="kit-grid">
              {vehicle.kits.map((kit) => (
                <KitCard
                  key={kit.id}
                  vehicleId={vehicle.id}
                  kit={kit}
                  isAdmin={isAdmin}
                  onRemove={() => setPendingRemove(kit)}
                  onReassign={() => setReassigning(kit)}
                />
              ))}
            </div>
          )
        ) : null}
        {tab === 'MOVEMENTS' ? <MovementsList vehicleId={vehicle.id} /> : null}
        {tab === 'CHECKS' ? <ChecksList vehicleId={vehicle.id} /> : null}
      </div>

      {isAdmin ? (
        <AssignGroupDialog
          open={assigning}
          vehicle={vehicle}
          onClose={() => setAssigning(false)}
        />
      ) : null}
      {isAdmin ? (
        <RenameVehicleDialog key={renaming} open={renaming !== 0} vehicle={vehicle} onClose={() => setRenaming(0)} />
      ) : null}
      {isAdmin ? (
        <ReassignKitDialog
          kit={reassigning}
          sourceVehicle={vehicle}
          onClose={() => setReassigning(null)}
          onDone={(targetId) => {
            setReassigning(null)
            navigate(routes.vehicle(targetId))
          }}
        />
      ) : null}

      <Dialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title={pendingRemove && deletionBlocked(pendingRemove.lines.map((l) => l.quantity)) ? 'No se puede retirar' : '¿Retirar caja?'}
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setPendingRemove(null)}>
              {pendingRemove && deletionBlocked(pendingRemove.lines.map((l) => l.quantity)) ? 'Cerrar' : 'Cancelar'}
            </Button>
            {pendingRemove && !deletionBlocked(pendingRemove.lines.map((l) => l.quantity)) ? (
              <Button variant="text" danger icon={<Trash2 />} onClick={() => void confirmRemove()}>
                Retirar
              </Button>
            ) : null}
          </>
        }
      >
        <p className="dialog__text">
          {pendingRemove && deletionBlocked(pendingRemove.lines.map((l) => l.quantity))
            ? `La caja «${pendingRemove.groupName}» tiene ítems con cantidad mayor que cero. Déjala en cero o muévela a otra placa.`
            : `Se retirará la caja «${pendingRemove?.groupName ?? ''}» de ${formatPlate(vehicle.plate)}. El historial se conserva.`}
        </p>
      </Dialog>
    </>
  )
}

function KitCard({
  vehicleId,
  kit,
  isAdmin,
  onRemove,
  onReassign,
}: {
  vehicleId: string
  kit: VehicleKit
  isAdmin: boolean
  onRemove: () => void
  onReassign: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <article className="card">
      <div className="kit-card__head">
        <span className="icon-badge icon-badge--hi">{kit.kind === 'TOOL' ? <Wrench /> : <Boxes />}</span>
        <div className="kit-card__title">
          <h3>{kit.groupName}</h3>
          <div className="row" style={{ gap: 6 }}>
            {kit.kind ? (
              <span className={`badge ${kit.kind === 'TOOL' ? 'badge--primary' : 'badge--accent'}`}>{kindLabel[kit.kind]}</span>
            ) : (
              <span className="badge badge--caution">Sin tipo</span>
            )}
            <span className="muted" style={{ fontSize: '0.8125rem' }}>
              {plural(kit.lines.length, 'ítem', 'ítems')}
            </span>
          </div>
        </div>
        {isAdmin ? (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <IconButton label="Más opciones" size="sm" onClick={() => setMenuOpen((value) => !value)}>
              <MoreVertical />
            </IconButton>
            {menuOpen ? (
              <div className="menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onReassign()
                  }}
                >
                  <ArrowRightLeft /> Mover a otra placa
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onRemove()
                  }}
                >
                  <Trash2 /> Retirar caja
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <hr className="card__divider" />
      {kit.lines.length === 0 ? (
        <div className="kit-empty">El grupo no tiene ítems en el inventario.</div>
      ) : (
        kit.lines.map((line) => <KitLineRow key={line.id} vehicleId={vehicleId} kit={kit} line={line} isAdmin={isAdmin} />)
      )}
      {!kit.kind && !isAdmin ? (
        <div style={{ padding: '0 12px 12px' }}>
          <InlineMessage kind="info" icon={<Info />}>
            El administrador debe definir el tipo del grupo (herramienta o consumible) para habilitar chequeos o consumos.
          </InlineMessage>
        </div>
      ) : null}
    </article>
  )
}

function KitLineRow({
  vehicleId,
  kit,
  line,
  isAdmin,
}: {
  vehicleId: string
  kit: VehicleKit
  line: KitLine
  isAdmin: boolean
}) {
  const toast = useToast()
  const adjust = useAdjustLine()
  const consume = useConsumeLine()
  const check = useCheckTool()
  const [draft, setDraft] = useState(line.quantity)
  const [synced, setSynced] = useState(line.quantity)
  const [consuming, setConsuming] = useState(false)
  const [consumeQty, setConsumeQty] = useState(1)

  // Si el servidor cambió la cantidad (otro usuario, consumo), el borrador se alinea.
  if (synced !== line.quantity) {
    setSynced(line.quantity)
    setDraft(line.quantity)
  }

  const commitAdjust = async (value: number) => {
    if (value === line.quantity) return
    try {
      await adjust.mutateAsync({ vehicleId, lineId: line.id, quantity: value })
    } catch (error) {
      setDraft(line.quantity)
      toast.error(messageOf(error, 'No se pudo ajustar la cantidad'))
    }
  }

  const doConsume = async () => {
    try {
      await consume.mutateAsync({ vehicleId, lineId: line.id, quantity: consumeQty })
      toast.success(`Descontado ${consumeQty} de ${line.itemName}`)
      setConsuming(false)
      setConsumeQty(1)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo registrar el consumo'))
    }
  }

  const doCheck = async () => {
    try {
      await check.mutateAsync({ vehicleId, lineId: line.id })
      toast.success(`${line.itemName} chequeado`)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo registrar el chequeo'))
    }
  }

  return (
    <div className="kit-line">
      <span className="kit-line__name">{line.itemName}</span>
      {isAdmin ? (
        <div
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) void commitAdjust(draft)
          }}
        >
          <Stepper
            label={`Cantidad de ${line.itemName}`}
            value={draft}
            disabled={adjust.isPending}
            onChange={(value) => {
              setDraft(value)
              // Botones +/-: confirmar de inmediato. La entrada directa confirma al salir.
              if (Math.abs(value - draft) === 1) void commitAdjust(value)
            }}
          />
        </div>
      ) : (
        <>
          <span className={['kit-line__qty', line.quantity === 0 ? 'kit-line__qty--zero' : ''].join(' ')}>
            {line.quantity}
          </span>
          {kit.kind === 'CONSUMABLE' ? (
            <IconButton
              label={`Consumir ${line.itemName}`}
              size="sm"
              accent
              disabled={line.quantity === 0}
              onClick={() => setConsuming(true)}
            >
              <MinusCircle />
            </IconButton>
          ) : null}
          {kit.kind === 'TOOL' ? (
            <IconButton label={`Chequear ${line.itemName}`} size="sm" accent disabled={check.isPending} onClick={() => void doCheck()}>
              <CheckCircle2 />
            </IconButton>
          ) : null}
        </>
      )}

      <Dialog
        open={consuming}
        onClose={() => setConsuming(false)}
        title={`Consumir ${line.itemName}`}
        icon={<MinusCircle />}
        locked={consume.isPending}
        actions={
          <>
            <Button variant="text" onClick={() => setConsuming(false)}>
              Cancelar
            </Button>
            <Button loading={consume.isPending} disabled={consumeQty < 1 || consumeQty > line.quantity} onClick={() => void doConsume()}>
              Descontar
            </Button>
          </>
        }
      >
        <p className="dialog__text">Hay {line.quantity} en la caja. ¿Cuántos se usaron?</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Stepper label="Cantidad a consumir" value={consumeQty} min={1} max={Math.max(1, line.quantity)} onChange={setConsumeQty} />
        </div>
      </Dialog>
    </div>
  )
}

function AssignGroupDialog({ open, vehicle, onClose }: { open: boolean; vehicle: Vehicle; onClose: () => void }) {
  const toast = useToast()
  const inventory = useInventory()
  const assign = useAssignKit()
  const [groupId, setGroupId] = useState('')
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())

  const available = useMemo(() => {
    const assigned = new Set(vehicle.kits.map((kit) => kit.groupId))
    return (inventory.data ?? []).filter((group) => !assigned.has(group.id))
  }, [inventory.data, vehicle.kits])
  const group: InventoryGroup | undefined = available.find((item) => item.id === groupId)

  const close = () => {
    setGroupId('')
    setQuantities(new Map())
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!group) return
    try {
      await assign.mutateAsync({ vehicleId: vehicle.id, groupId: group.id, quantities })
      toast.success(`Caja «${group.name}» asignada`)
      close()
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo asignar el grupo'))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Asignar grupo"
      icon={<Boxes />}
      locked={assign.isPending}
      actions={
        <>
          <Button variant="text" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="assign-group" loading={assign.isPending} disabled={!group}>
            Asignar
          </Button>
        </>
      }
    >
      <form id="assign-group" className="stack" onSubmit={submit}>
        {inventory.isPending ? <Loading /> : null}
        {inventory.data && available.length === 0 ? (
          <InlineMessage kind="info" icon={<Info />}>
            Todos los grupos del inventario ya están en esta placa, o el inventario está vacío.
          </InlineMessage>
        ) : null}
        {available.length > 0 ? (
          <SelectField
            label="Grupo del inventario"
            icon={<Boxes />}
            value={groupId}
            placeholder="Selecciona un grupo…"
            onChange={(event) => {
              setGroupId(event.target.value)
              setQuantities(new Map())
            }}
          >
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.kind ? ` · ${kindLabel[item.kind]}` : ''}
              </option>
            ))}
          </SelectField>
        ) : null}
        {group ? (
          <>
            <span className="label">Cantidades iniciales</span>
            {group.items.map((item) => (
              <div key={item.id} className="assign-line">
                <span>{item.name}</span>
                <Stepper
                  label={`Cantidad inicial de ${item.name}`}
                  value={quantities.get(item.id) ?? 0}
                  onChange={(value) =>
                    setQuantities((prev) => {
                      const next = new Map(prev)
                      next.set(item.id, value)
                      return next
                    })
                  }
                />
              </div>
            ))}
          </>
        ) : null}
      </form>
    </Dialog>
  )
}

function RenameVehicleDialog({ open, vehicle, onClose }: { open: boolean; vehicle: Vehicle; onClose: () => void }) {
  const toast = useToast()
  const vehicles = useVehicles()
  const rename = useRenameVehicle()
  const [plate, setPlate] = useState(formatPlate(vehicle.plate))
  const [touched, setTouched] = useState(false)

  const others = new Set((vehicles.data ?? []).filter((item) => item.id !== vehicle.id).map((item) => item.plate))
  const error = validatePlate(plate, others)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (error) return
    try {
      await rename.mutateAsync({ vehicleId: vehicle.id, plate: normalizePlate(plate) })
      toast.success('Placa actualizada')
      onClose()
    } catch (caught) {
      toast.error(DomainError.is(caught, 'CONFLICT') ? 'Esa placa ya existe' : messageOf(caught, 'No se pudo actualizar'))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cambiar placa"
      icon={<Truck />}
      locked={rename.isPending}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="rename-vehicle" loading={rename.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="rename-vehicle" onSubmit={submit} noValidate>
        <TextField
          label="Placa"
          icon={<Truck />}
          autoComplete="off"
          value={plate}
          onChange={(event) => setPlate(formatPlate(normalizePlate(event.target.value).slice(0, 6)))}
          error={touched && error ? plateErrorText[error] : null}
        />
      </form>
    </Dialog>
  )
}

function ReassignKitDialog({
  kit,
  sourceVehicle,
  onClose,
  onDone,
}: {
  kit: VehicleKit | null
  sourceVehicle: Vehicle
  onClose: () => void
  onDone: (targetVehicleId: string) => void
}) {
  const toast = useToast()
  const vehicles = useVehicles()
  const reassign = useReassignKit()
  const [targetId, setTargetId] = useState('')

  const targets = (vehicles.data ?? []).filter(
    (vehicle) => vehicle.id !== sourceVehicle.id && !vehicle.kits.some((item) => item.groupId === kit?.groupId),
  )

  const close = () => {
    setTargetId('')
    onClose()
  }

  const submit = async () => {
    if (!kit || !targetId) return
    try {
      await reassign.mutateAsync({ kitId: kit.id, sourceVehicleId: sourceVehicle.id, targetVehicleId: targetId })
      toast.success('Caja movida')
      const target = targetId
      setTargetId('')
      onDone(target)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo mover la caja'))
    }
  }

  return (
    <Dialog
      open={kit !== null}
      onClose={close}
      title="Mover caja a otra placa"
      icon={<ArrowRightLeft />}
      locked={reassign.isPending}
      actions={
        <>
          <Button variant="text" onClick={close}>
            Cancelar
          </Button>
          <Button loading={reassign.isPending} disabled={!targetId} onClick={() => void submit()}>
            Mover
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="dialog__text">
          La caja «{kit?.groupName ?? ''}» pasa con sus cantidades a la placa que elijas. Queda registrado en el historial.
        </p>
        {targets.length === 0 ? (
          <InlineMessage kind="info" icon={<Info />}>
            No hay otra placa sin este grupo.
          </InlineMessage>
        ) : (
          <SelectField
            label="Placa destino"
            icon={<Truck />}
            value={targetId}
            placeholder="Selecciona…"
            onChange={(event) => setTargetId(event.target.value)}
          >
            {targets.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {formatPlate(vehicle.plate)}
              </option>
            ))}
          </SelectField>
        )}
      </div>
    </Dialog>
  )
}

function MovementsList({ vehicleId }: { vehicleId: string }) {
  const movements = useMovements(vehicleId)
  if (movements.isPending) return <Loading />
  if (movements.isError) return <ErrorState message="No se pudo cargar el historial." onRetry={() => void movements.refetch()} />
  if (movements.data.length === 0) {
    return <EmptyState icon={<History />} title="Sin movimientos" body="Los ajustes y consumos de esta placa aparecerán aquí." />
  }
  return (
    <div className="card">
      {movements.data.map((movement) => {
        const delta = movement.newQuantity - movement.previousQuantity
        const consumption = movement.kind.includes('CONSUMPTION')
        return (
          <div key={movement.id} className="history-row">
            <span>
              {movement.itemName} <span className="muted">· {movement.groupName}</span>
            </span>
            <span className="history-row__delta" style={{ color: delta < 0 ? 'var(--status-alert)' : 'var(--status-operative)' }}>
              {delta > 0 ? '+' : ''}
              {delta} → {movement.newQuantity}
            </span>
            <span className="history-row__meta">
              {consumption ? 'Consumo' : 'Ajuste'} · {movement.actorName || 'Sistema'} · {formatDateTime(movement.createdAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChecksList({ vehicleId }: { vehicleId: string }) {
  const checks = useToolChecks(vehicleId)
  if (checks.isPending) return <Loading />
  if (checks.isError) return <ErrorState message="No se pudieron cargar los chequeos." onRetry={() => void checks.refetch()} />
  if (checks.data.length === 0) {
    return <EmptyState icon={<CheckCircle2 />} title="Sin chequeos" body="Cada chequeo de herramienta que registren los operadores quedará aquí." />
  }
  return (
    <div className="card">
      {checks.data.map((check) => (
        <div key={check.id} className="history-row">
          <span>
            {check.itemName} <span className="muted">· {check.groupName}</span>
          </span>
          <CheckCircle2 size={18} color="var(--status-operative)" />
          <span className="history-row__meta">
            {check.actorName || 'Sistema'} · {formatDateTime(check.createdAt)}
          </span>
        </div>
      ))}
    </div>
  )
}
