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
  useRenameItem,
  useUpdateGroup,
} from '@/application/hooks/useInventory'
import { DomainError, KitQuantityBlockedError, messageOf } from '@/domain/errors'
import { CATALOG_KINDS, type CatalogGroupKind, type InventoryGroup, type InventoryItem } from '@/domain/model/inventory'
import {
  canonicalGroupName,
  findGroup,
  INVENTORY_MAX_GROUP_LENGTH,
  INVENTORY_MAX_NAME_LENGTH,
  normalizeText,
  validateGroupRename,
  validateInventoryItem,
} from '@/domain/validation/inventoryValidator'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { inventoryErrorText, kindLabel, plural } from '@/presentation/i18n/labels'

import './inventory.css'

export default function InventoryPage() {
  const isAdmin = useIsAdmin()
  const inventory = useInventory()
  const [adding, setAdding] = useState<{ groupName: string; nonce: number } | null>(null)
  const openAdd = (groupName: string) => setAdding({ groupName, nonce: Date.now() })

  const totalItems = useMemo(() => (inventory.data ?? []).reduce((sum, group) => sum + group.items.length, 0), [inventory.data])

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
          <div className="inventory-grid">
            {inventory.data.map((group, index) => (
              <GroupCard
                key={group.id}
                group={group}
                groups={inventory.data}
                isAdmin={isAdmin}
                isFirst={index === 0}
                isLast={index === inventory.data.length - 1}
                onAddItem={() => openAdd(group.name)}
              />
            ))}
          </div>
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
  onAddItem,
}: {
  group: InventoryGroup
  groups: readonly InventoryGroup[]
  isAdmin: boolean
  isFirst: boolean
  isLast: boolean
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
    <article className="card inventory-group">
      <div className="inventory-group__head">
        <span className="icon-badge icon-badge--hi">{group.kind === 'TOOL' ? <Wrench /> : <Boxes />}</span>
        {renaming ? (
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
        ) : (
          <div className="inventory-group__title">
            <h3>{group.name}</h3>
            <div className="row" style={{ gap: 6 }}>
              {group.kind ? (
                <span className={`badge ${group.kind === 'TOOL' ? 'badge--primary' : 'badge--accent'}`}>{kindLabel[group.kind]}</span>
              ) : (
                <button type="button" className="badge badge--caution inventory-group__define" onClick={() => isAdmin && setKindDialog(true)}>
                  <Tag size={12} /> {isAdmin ? 'Definir tipo' : 'Sin tipo'}
                </button>
              )}
              <span className="muted" style={{ fontSize: '0.8125rem' }}>
                {plural(group.items.length, 'ítem', 'ítems')}
              </span>
            </div>
          </div>
        )}
        {isAdmin && !renaming ? (
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
        ) : null}
      </div>
      <hr className="card__divider" />
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
    </article>
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
  const rename = useRenameItem()
  const move = useMoveItem()
  const remove = useDeleteItem()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [confirm, setConfirm] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const error = editing ? validateInventoryItem(name, group.name, groups, item.id).nameError : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (error) return
    const next = normalizeText(name)
    if (next === item.name) return setEditing(false)
    try {
      await rename.mutateAsync({ itemId: item.id, name: next })
      setEditing(false)
    } catch (caught) {
      toast.error(DomainError.is(caught, 'CONFLICT') ? 'Ya existe un ítem con ese nombre' : messageOf(caught, 'No se pudo renombrar'))
    }
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
      <form className="inventory-item inventory-item--editing" onSubmit={submit}>
        <TextField
          label="Nombre del ítem"
          value={name}
          maxLength={INVENTORY_MAX_NAME_LENGTH}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          error={error ? inventoryErrorText(error, 'item') : null}
        />
        <IconButton label="Guardar" type="submit" size="sm" accent disabled={rename.isPending}>
          <Check />
        </IconButton>
        <IconButton label="Cancelar" size="sm" onClick={() => setEditing(false)}>
          <X />
        </IconButton>
      </form>
    )
  }

  return (
    <div className="inventory-item">
      <span className="inventory-item__name">{item.name}</span>
      {isAdmin ? (
        <div className="inventory-item__actions">
          <IconButton label="Subir" size="sm" disabled={isFirst || move.isPending} onClick={() => void move.mutateAsync({ itemId: item.id, delta: -1 })}>
            <ArrowUp />
          </IconButton>
          <IconButton label="Bajar" size="sm" disabled={isLast || move.isPending} onClick={() => void move.mutateAsync({ itemId: item.id, delta: 1 })}>
            <ArrowDown />
          </IconButton>
          <IconButton label={`Renombrar ${item.name}`} size="sm" onClick={() => { setName(item.name); setEditing(true) }}>
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
  const [touched, setTouched] = useState(false)

  const validation = validateInventoryItem(name, groupName, groups)
  const existing = findGroup(groups, groupName)
  const needsKind = !existing && normalizeText(groupName).length > 0
  const kindError = touched && needsKind && !kind ? 'Un grupo nuevo necesita un tipo' : null
  const isValid = validation.isValid && (!needsKind || kind !== '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!isValid) return
    try {
      await create.mutateAsync({
        name: normalizeText(name),
        groupName: canonicalGroupName(groupName, groups),
        kind: existing ? null : (kind || null),
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
          onChange={(event) => setName(event.target.value)}
          error={touched && validation.nameError ? inventoryErrorText(validation.nameError, 'item') : null}
        />
        {existing && !existing.kind ? (
          <InlineMessage kind="info">Este grupo aún no tiene tipo. Defínelo desde su menú para habilitar chequeos o consumos.</InlineMessage>
        ) : null}
      </form>
    </Dialog>
  )
}
