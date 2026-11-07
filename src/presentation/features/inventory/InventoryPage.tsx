import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  FolderPlus,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Tag,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { useIsAdmin } from '@/application/ContainerContext'
import {
  useCreateItem,
  useDeleteGroup,
  useDeleteItem,
  useInventory,
  useMoveGroup,
  useMoveItem,
  useUpdateGroup,
  useUpdateItem,
} from '@/application/hooks/useInventory'
import { DomainError, KitQuantityBlockedError, messageOf } from '@/domain/errors'
import {
  CATALOG_KINDS,
  INVENTORY_UNITS,
  suggestInventoryUnit,
  type CatalogGroupKind,
  type InventoryGroup,
  type InventoryItem,
  type InventoryUnit,
} from '@/domain/model/inventory'
import {
  canonicalGroupName,
  findGroup,
  INVENTORY_MAX_GROUP_LENGTH,
  INVENTORY_MAX_NAME_LENGTH,
  normalizeText,
  parseLowStockThresholdInput,
  validateGroupRename,
  validateInventoryItem,
} from '@/domain/validation/inventoryValidator'
import { Button, IconButton } from '@/presentation/components/Button'
import {
  CollapseAllBar,
  CollapsibleGroup,
  groupTone,
  useCollapsedGroups,
} from '@/presentation/components/CollapsibleGroup'
import { Dialog } from '@/presentation/components/Dialog'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { inventoryErrorText, kindLabel, plural, unitLabel, unitShortLabel } from '@/presentation/i18n/labels'

import './inventory.css'

export default function InventoryPage() {
  const isAdmin = useIsAdmin()
  const inventory = useInventory()
  const [adding, setAdding] = useState<{ groupName: string; nonce: number } | null>(null)
  const openAdd = (groupName: string) => setAdding({ groupName, nonce: Date.now() })

  const totalItems = useMemo(() => (inventory.data ?? []).reduce((sum, group) => sum + group.items.length, 0), [inventory.data])
  const collapse = useCollapsedGroups('tn.inventory.collapsed')
  const groupIds = useMemo(() => (inventory.data ?? []).map((group) => group.id), [inventory.data])
  const kindCounts = useMemo(() => {
    const groups = inventory.data ?? []
    return {
      tool: groups.filter((group) => group.kind === 'TOOL').length,
      consumable: groups.filter((group) => group.kind === 'CONSUMABLE').length,
      untyped: groups.filter((group) => !group.kind).length,
    }
  }, [inventory.data])

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle={inventory.data ? `${plural(inventory.data.length, 'grupo', 'grupos')} · ${plural(totalItems, 'ítem', 'ítems')}` : 'Catálogo de herramientas y consumibles'}
        actions={
          isAdmin && inventory.data && inventory.data.length > 0 ? (
            <IconButton label="Nuevo grupo" accent onClick={() => openAdd('')}>
              <FolderPlus />
            </IconButton>
          ) : undefined
        }
      />
      <div className="page-body">
        {inventory.isPending ? <Loading /> : null}
        {inventory.isError ? (
          <ErrorState message="No se pudo cargar el inventario." onRetry={() => void inventory.refetch()} />
        ) : null}
        {inventory.data && inventory.data.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="Inventario vacío"
            body="Crea el catálogo: grupos (p. ej. «Ópticas», «Herramienta eléctrica») con sus ítems. Las cantidades se llevan por vehículo."
            action={
              isAdmin ? (
                <Button variant="outlined" icon={<Plus />} onClick={() => openAdd('')}>
                  Agregar ítem
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {inventory.data && inventory.data.length > 0 ? (
          <>
            <CollapseAllBar ids={groupIds} isCollapsed={collapse.isCollapsed} setAll={collapse.setAll}>
              {kindCounts.tool > 0 ? (
                <span className="cgroup-stat cgroup-stat--tool">
                  <Wrench size={14} /> <strong>{kindCounts.tool}</strong> {kindCounts.tool === 1 ? 'herramienta' : 'herramientas'}
                </span>
              ) : null}
              {kindCounts.consumable > 0 ? (
                <span className="cgroup-stat cgroup-stat--consumable">
                  <Boxes size={14} /> <strong>{kindCounts.consumable}</strong> {kindCounts.consumable === 1 ? 'consumible' : 'consumibles'}
                </span>
              ) : null}
              {kindCounts.untyped > 0 ? (
                <span className="cgroup-stat cgroup-stat--untyped">
                  <Tag size={14} /> <strong>{kindCounts.untyped}</strong> sin tipo
                </span>
              ) : null}
            </CollapseAllBar>
            <div className="cgroup-grid">
              {inventory.data.map((group, index) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  groups={inventory.data}
                  isAdmin={isAdmin}
                  isFirst={index === 0}
                  isLast={index === inventory.data.length - 1}
                  collapsed={collapse.isCollapsed(group.id)}
                  onToggle={() => collapse.toggle(group.id)}
                  onAddItem={() => openAdd(group.name)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {isAdmin && inventory.data && inventory.data.length > 0 ? (
        <button type="button" className="fab" onClick={() => openAdd('')}>
          <Plus size={20} /> Agregar ítem
        </button>
      ) : null}

      {isAdmin ? (
        <AddItemDialog
          key={adding?.nonce ?? 'closed'}
          open={adding !== null}
          initialGroup={adding?.groupName ?? ''}
          groups={inventory.data ?? []}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </>
  )
}

function GroupCard({
  group,
  groups,
  isAdmin,
  isFirst,
  isLast,
  collapsed,
  onToggle,
  onAddItem,
}: {
  group: InventoryGroup
  groups: readonly InventoryGroup[]
  isAdmin: boolean
  isFirst: boolean
  isLast: boolean
  collapsed: boolean
  onToggle: () => void
  onAddItem: () => void
}) {
  const toast = useToast()
  const update = useUpdateGroup()
  const move = useMoveGroup()
  const remove = useDeleteGroup()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(group.name)
  const [kindDialog, setKindDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const renameError = renaming ? validateGroupRename(newName, group.name, groups) : null

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    if (renameError) return
    const name = normalizeText(newName)
    if (name === group.name) return setRenaming(false)
    try {
      await update.mutateAsync({ groupId: group.id, patch: { name } })
      toast.success('Grupo renombrado')
      setRenaming(false)
    } catch (error) {
      toast.error(DomainError.is(error, 'CONFLICT') ? 'Ya existe un grupo con ese nombre' : messageOf(error, 'No se pudo renombrar'))
    }
  }

  const setKind = async (kind: CatalogGroupKind) => {
    try {
      await update.mutateAsync({ groupId: group.id, patch: { kind } })
      toast.success(`Grupo definido como ${kindLabel[kind].toLowerCase()}`)
      setKindDialog(false)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo definir el tipo'))
    }
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    try {
      await remove.mutateAsync(group.id)
      toast.success('Grupo eliminado')
    } catch (error) {
      if (error instanceof KitQuantityBlockedError) setBlocked(true)
      else toast.error(messageOf(error, 'No se pudo eliminar el grupo'))
    }
  }

  return (
    <>
      <CollapsibleGroup
        tone={groupTone(group.kind)}
        icon={group.kind === 'TOOL' ? <Wrench /> : <Boxes />}
        title={group.name}
        collapsed={collapsed}
        onToggle={onToggle}
        meta={
          <>
            {group.kind ? (
              <span className="cgroup-kind">{kindLabel[group.kind]}</span>
            ) : !isAdmin ? (
              <span className="cgroup-kind">
                <Tag /> Sin tipo
              </span>
            ) : null}
            <span className="cgroup-count">{plural(group.items.length, 'ítem', 'ítems')}</span>
          </>
        }
        editor={
          renaming ? (
            <form className="inventory-group__rename" onSubmit={submitRename}>
              <TextField
                label="Nombre del grupo"
                value={newName}
                maxLength={INVENTORY_MAX_GROUP_LENGTH}
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
                error={renameError ? inventoryErrorText(renameError, 'group') : null}
              />
              <IconButton label="Guardar nombre" type="submit" size="sm" accent disabled={update.isPending}>
                <Check />
              </IconButton>
              <IconButton label="Cancelar" size="sm" onClick={() => setRenaming(false)}>
                <X />
              </IconButton>
            </form>
          ) : undefined
        }
        actions={
          isAdmin && !renaming ? (
            <>
              {!group.kind ? (
                <button type="button" className="cgroup-kind" onClick={() => setKindDialog(true)}>
                  <Tag /> Definir tipo
                </button>
              ) : null}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <IconButton label="Opciones del grupo" size="sm" onClick={() => setMenuOpen((value) => !value)}>
                  <MoreVertical />
                </IconButton>
                {menuOpen ? (
                  <div className="menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onAddItem() }}>
                      <Plus /> Agregar ítem
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setNewName(group.name); setRenaming(true) }}>
                      <Pencil /> Renombrar
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setKindDialog(true) }}>
                      <Tag /> {group.kind ? 'Cambiar tipo' : 'Definir tipo'}
                    </button>
                    <button type="button" role="menuitem" disabled={isFirst || move.isPending} onClick={() => { setMenuOpen(false); void move.mutateAsync({ groupId: group.id, delta: -1 }) }}>
                      <ArrowUp /> Subir
                    </button>
                    <button type="button" role="menuitem" disabled={isLast || move.isPending} onClick={() => { setMenuOpen(false); void move.mutateAsync({ groupId: group.id, delta: 1 }) }}>
                      <ArrowDown /> Bajar
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}>
                      <Trash2 /> Eliminar grupo
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : undefined
        }
      >
        {group.items.length === 0 ? (
          <div className="inventory-empty">Sin ítems</div>
        ) : (
          group.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              group={group}
              groups={groups}
              isAdmin={isAdmin}
              isFirst={index === 0}
              isLast={index === group.items.length - 1}
            />
          ))
        )}
      </CollapsibleGroup>

      <Dialog
        open={kindDialog}
        onClose={() => setKindDialog(false)}
        title={`Tipo de «${group.name}»`}
        icon={<Tag />}
        locked={update.isPending}
      >
        <p className="dialog__text">
          Una <strong>herramienta</strong> se chequea (no se gasta). Un <strong>consumible</strong> se descuenta cuando se usa.
        </p>
        <div className="stack" style={{ marginTop: 12 }}>
          {CATALOG_KINDS.map((kind) => (
            <Button
              key={kind}
              variant={group.kind === kind ? 'filled' : 'tonal'}
              icon={kind === 'TOOL' ? <Wrench /> : <Boxes />}
              loading={update.isPending}
              onClick={() => void setKind(kind)}
            >
              {kindLabel[kind]}
            </Button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Eliminar grupo?"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="text" danger icon={<Trash2 />} onClick={() => void doDelete()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          Se eliminará «{group.name}» con sus {plural(group.items.length, 'ítem', 'ítems')} y se retirará de todas las placas.
          Solo es posible si ninguna caja tiene cantidades.
        </p>
      </Dialog>

      <Dialog
        open={blocked}
        onClose={() => setBlocked(false)}
        title="No se puede eliminar"
        icon={<TriangleAlert />}
        actions={
          <Button variant="text" onClick={() => setBlocked(false)}>
            Entendido
          </Button>
        }
      >
        <p className="dialog__text">Algún vehículo tiene ítems de «{group.name}» con cantidad mayor que cero. Déjalos en cero y vuelve a intentarlo.</p>
      </Dialog>
    </>
  )
}

function ItemRow({
  item,
  group,
  groups,
  isAdmin,
  isFirst,
  isLast,
}: {
  item: InventoryItem
  group: InventoryGroup
  groups: readonly InventoryGroup[]
  isAdmin: boolean
  isFirst: boolean
  isLast: boolean
}) {
  const toast = useToast()
  const update = useUpdateItem()
  const move = useMoveItem()
  const remove = useDeleteItem()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState<InventoryUnit>(item.unit)
  const [threshold, setThreshold] = useState(item.lowStockThreshold === null ? '' : String(item.lowStockThreshold))
  const [confirm, setConfirm] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const isConsumable = group.kind === 'CONSUMABLE'
  const thresholdInput = parseLowStockThresholdInput(threshold)

  const error = editing ? validateInventoryItem(name, group.name, groups, item.id).nameError : null
  const nameChanged = normalizeText(name) !== item.name
  const unitChanged = unit !== item.unit
  const thresholdChanged = isConsumable && thresholdInput.error === null && thresholdInput.value !== item.lowStockThreshold
  const canSave = !error && thresholdInput.error === null && (nameChanged || unitChanged || thresholdChanged)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (error || !canSave) return
    const next = normalizeText(name)
    const patch: { name?: string; unit?: InventoryUnit; lowStockThreshold?: number | null } = {}
    if (nameChanged) patch.name = next
    if (unitChanged) patch.unit = unit
    if (thresholdChanged) patch.lowStockThreshold = thresholdInput.value
    try {
      await update.mutateAsync({ itemId: item.id, patch })
      setEditing(false)
      toast.success('Ítem actualizado')
    } catch (caught) {
      toast.error(DomainError.is(caught, 'CONFLICT') ? 'Ya existe un ítem con ese nombre' : messageOf(caught, 'No se pudo guardar'))
    }
  }

  const startEdit = () => {
    setName(item.name)
    setUnit(item.unit)
    setThreshold(item.lowStockThreshold === null ? '' : String(item.lowStockThreshold))
    setEditing(true)
  }

  const doDelete = async () => {
    setConfirm(false)
    try {
      await remove.mutateAsync(item.id)
      toast.success('Ítem eliminado')
    } catch (caught) {
      if (caught instanceof KitQuantityBlockedError) setBlocked(true)
      else toast.error(messageOf(caught, 'No se pudo eliminar el ítem'))
    }
  }

  if (editing) {
    return (
      <form className="inventory-item inventory-item--editing cgroup-row" onSubmit={submit}>
        <div className="inventory-item__edit-fields">
          <TextField
            label="Nombre del ítem"
            value={name}
            maxLength={INVENTORY_MAX_NAME_LENGTH}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            error={error ? inventoryErrorText(error, 'item') : null}
          />
          <SelectField
            label="Unidad"
            value={unit}
            onChange={(event) => setUnit(event.target.value as InventoryUnit)}
          >
            {INVENTORY_UNITS.map((option) => (
              <option key={option} value={option}>
                {unitLabel[option]}
              </option>
            ))}
          </SelectField>
          {isConsumable ? (
            <div className="inventory-item__threshold">
              <TextField
                label="Alerta si stock ≤"
                inputMode="numeric"
                placeholder="Sin alerta"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                error={thresholdInput.error ? 'Usa un entero mayor o igual que 0' : null}
                hint="Vacío la deja apagada. 0 avisa cuando no queda nada."
              />
            </div>
          ) : null}
        </div>
        <IconButton label="Guardar" type="submit" size="sm" accent disabled={update.isPending || !canSave}>
          <Check />
        </IconButton>
        <IconButton label="Cancelar" size="sm" onClick={() => setEditing(false)}>
          <X />
        </IconButton>
      </form>
    )
  }

  return (
    <div className="inventory-item cgroup-row">
      <span className="inventory-item__name">
        <span className="inventory-item__label">{item.name}</span>
        <span className="inventory-item__unit" title={unitLabel[item.unit]}>
          {unitShortLabel[item.unit]}
        </span>
        {isConsumable && item.lowStockThreshold !== null ? (
          <span className="inventory-item__alert" title={`Alerta si el stock baja a ${item.lowStockThreshold} o menos`}>
            ≤ {item.lowStockThreshold}
          </span>
        ) : null}
      </span>
      {isAdmin ? (
        <div className="inventory-item__actions">
          <IconButton label="Subir" size="sm" disabled={isFirst || move.isPending} onClick={() => void move.mutateAsync({ itemId: item.id, delta: -1 })}>
            <ArrowUp />
          </IconButton>
          <IconButton label="Bajar" size="sm" disabled={isLast || move.isPending} onClick={() => void move.mutateAsync({ itemId: item.id, delta: 1 })}>
            <ArrowDown />
          </IconButton>
          <IconButton label={`Editar ${item.name}`} size="sm" onClick={startEdit}>
            <Pencil />
          </IconButton>
          <IconButton label={`Eliminar ${item.name}`} size="sm" danger onClick={() => setConfirm(true)}>
            <Trash2 />
          </IconButton>
        </div>
      ) : null}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Eliminar ítem?"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="text" danger icon={<Trash2 />} onClick={() => void doDelete()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          «{item.name}» desaparece del catálogo y de todas las cajas.
          {group.items.length === 1 ? ' Como es el último ítem, el grupo también se elimina.' : ''}
        </p>
      </Dialog>
      <Dialog
        open={blocked}
        onClose={() => setBlocked(false)}
        title="No se puede eliminar"
        icon={<TriangleAlert />}
        actions={
          <Button variant="text" onClick={() => setBlocked(false)}>
            Entendido
          </Button>
        }
      >
        <p className="dialog__text">Algún vehículo tiene «{item.name}» con cantidad mayor que cero. Déjalo en cero y vuelve a intentarlo.</p>
      </Dialog>
    </div>
  )
}

function AddItemDialog({
  open,
  initialGroup,
  groups,
  onClose,
}: {
  open: boolean
  initialGroup: string
  groups: readonly InventoryGroup[]
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateItem()
  const [name, setName] = useState('')
  const [groupName, setGroupName] = useState(initialGroup)
  const [kind, setKind] = useState<CatalogGroupKind | ''>('')
  const [unit, setUnit] = useState<InventoryUnit>('UNITS')
  const [unitTouched, setUnitTouched] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [touched, setTouched] = useState(false)

  const validation = validateInventoryItem(name, groupName, groups)
  const existing = findGroup(groups, groupName)
  const needsKind = !existing && normalizeText(groupName).length > 0
  const resolvedKind = existing ? existing.kind : kind || null
  const showThreshold = resolvedKind === 'CONSUMABLE'
  const thresholdInput = parseLowStockThresholdInput(threshold)
  const kindError = touched && needsKind && !kind ? 'Un grupo nuevo necesita un tipo' : null
  const thresholdError = showThreshold ? thresholdInput.error : null
  const isValid = validation.isValid && (!needsKind || kind !== '') && !thresholdError

  const onNameChange = (value: string) => {
    setName(value)
    if (!unitTouched) setUnit(suggestInventoryUnit(value))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!isValid) return
    try {
      await create.mutateAsync({
        name: normalizeText(name),
        groupName: canonicalGroupName(groupName, groups),
        kind: existing ? null : (kind || null),
        unit,
        lowStockThreshold: showThreshold ? thresholdInput.value : null,
      })
      toast.success('Ítem agregado')
      onClose()
    } catch (error) {
      toast.error(DomainError.is(error, 'CONFLICT') ? 'Ese ítem ya existe en el grupo' : messageOf(error, 'No se pudo agregar'))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Agregar ítem"
      icon={<Package />}
      locked={create.isPending}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="add-item" loading={create.isPending}>
            Agregar
          </Button>
        </>
      }
    >
      <form id="add-item" className="stack" onSubmit={submit} noValidate>
        <TextField
          label="Grupo"
          icon={<Boxes />}
          list="inventory-groups"
          placeholder="Ópticas, Herramienta eléctrica…"
          maxLength={INVENTORY_MAX_GROUP_LENGTH}
          autoComplete="off"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          error={touched && validation.groupError ? inventoryErrorText(validation.groupError, 'group') : null}
          hint={existing ? `Se agrega a «${existing.name}»` : needsKind ? 'Grupo nuevo' : undefined}
        />
        <datalist id="inventory-groups">
          {groups.map((group) => (
            <option key={group.id} value={group.name} />
          ))}
        </datalist>
        {needsKind ? (
          <SelectField
            label="Tipo del grupo nuevo"
            icon={<Tag />}
            value={kind}
            placeholder="Selecciona…"
            onChange={(event) => setKind(event.target.value as CatalogGroupKind | '')}
            error={kindError}
          >
            {CATALOG_KINDS.map((option) => (
              <option key={option} value={option}>
                {kindLabel[option]}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          label="Ítem"
          icon={<Package />}
          placeholder="Nombre del ítem"
          maxLength={INVENTORY_MAX_NAME_LENGTH}
          autoComplete="off"
          autoFocus={initialGroup.length > 0}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          error={touched && validation.nameError ? inventoryErrorText(validation.nameError, 'item') : null}
        />
        <SelectField
          label="Unidad"
          value={unit}
          onChange={(event) => {
            setUnitTouched(true)
            setUnit(event.target.value as InventoryUnit)
          }}
          hint="Obligatoria · se muestra junto a las cantidades en las cajas"
        >
          {INVENTORY_UNITS.map((option) => (
            <option key={option} value={option}>
              {unitLabel[option]}
            </option>
          ))}
        </SelectField>
        {showThreshold ? (
          <TextField
            label="Alerta si stock ≤"
            inputMode="numeric"
            placeholder="Sin alerta"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            error={touched && thresholdError ? 'Usa un entero mayor o igual que 0' : null}
            hint="Opcional. Vacío la deja apagada."
          />
        ) : null}
        {existing && !existing.kind ? (
          <InlineMessage kind="info">Este grupo aún no tiene tipo. Defínelo desde su menú para habilitar chequeos o consumos.</InlineMessage>
        ) : null}
      </form>
    </Dialog>
  )
}
