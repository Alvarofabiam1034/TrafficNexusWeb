import {
  Boxes,
  Check,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  User,
  UserMinus,
  UserPlus,
  Users,
  Wand2,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { useContainer, useIsAdmin, useRequiredSession } from '@/application/ContainerContext'
import {
  useAddMember,
  useCreateProject,
  useCreateUser,
  useDeleteUser,
  useProjects,
  useRemoveMember,
  useRenameProject,
  useUpdateUser,
  useUsers,
} from '@/application/hooks/useAdmin'
import { useProjectMembers } from '@/application/hooks/useCrews'
import { generatePassword } from '@/domain/auth/passwordGenerator'
import { DomainError, messageOf } from '@/domain/errors'
import { ACCOUNT_ROLES, type AccountRole, type AppUser, type Project, type ProjectMember } from '@/domain/model/user'
import { CREW_ROLES, type CrewRole } from '@/domain/model/crew'
import { normalizeEmail, validateEmail, validatePassword } from '@/domain/validation/appUserValidator'
import { normalizeName, validateName } from '@/domain/validation/crewValidator'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { useToast } from '@/presentation/components/Toast'
import { accountRoleLabel, emailErrorText, nameErrorText, passwordErrorText, plural, roleLabel } from '@/presentation/i18n/labels'

import './admin.css'

type Tab = 'MEMBERS' | 'USERS' | 'PROJECTS'

export default function AdminPage() {
  const isAdmin = useIsAdmin()
  const [tab, setTab] = useState<Tab>('MEMBERS')
  const [editing, setEditingState] = useState<{ user: AppUser | null; nonce: number } | null>(null)
  const setEditing = (value: AppUser | null | 'NEW') =>
    setEditingState(value === null ? null : { user: value === 'NEW' ? null : value, nonce: Date.now() })

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Admin" />
        <div className="page-body">
          <EmptyState icon={<Shield />} title="Solo para administradores" body="Tu cuenta es de operador. Aquí no hay nada que gestionar." />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Usuarios, miembros del proyecto y proyectos"
        actions={
          tab !== 'PROJECTS' ? (
            <IconButton label="Nuevo usuario" accent onClick={() => setEditing('NEW')}>
              <UserPlus />
            </IconButton>
          ) : undefined
        }
      />
      <div className="page-body">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'MEMBERS'} onClick={() => setTab('MEMBERS')}>
            <Users size={16} /> Miembros
          </button>
          <button type="button" role="tab" aria-selected={tab === 'USERS'} onClick={() => setTab('USERS')}>
            <User size={16} /> Usuarios
          </button>
          <button type="button" role="tab" aria-selected={tab === 'PROJECTS'} onClick={() => setTab('PROJECTS')}>
            <Boxes size={16} /> Proyectos
          </button>
        </div>
        {tab === 'MEMBERS' ? <MembersTab onEdit={(user) => setEditing(user)} onNew={() => setEditing('NEW')} /> : null}
        {tab === 'USERS' ? <UsersTab onEdit={(user) => setEditing(user)} onNew={() => setEditing('NEW')} /> : null}
        {tab === 'PROJECTS' ? <ProjectsTab /> : null}
      </div>

      {tab !== 'PROJECTS' ? (
        <button type="button" className="fab" onClick={() => setEditing('NEW')}>
          <Plus size={20} /> Nuevo usuario
        </button>
      ) : null}

      <UserDialog
        key={editing?.nonce ?? 'closed'}
        open={editing !== null}
        user={editing?.user ?? null}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Miembros del proyecto                                              */
/* ------------------------------------------------------------------ */

function MembersTab({ onEdit, onNew }: { onEdit: (user: AppUser) => void; onNew: () => void }) {
  const toast = useToast()
  const session = useRequiredSession()
  const members = useProjectMembers()
  const users = useUsers()
  const addMember = useAddMember()
  const removeMember = useRemoveMember()
  const [adding, setAdding] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<ProjectMember | null>(null)

  const notMembers = useMemo(() => {
    const ids = new Set((members.data ?? []).map((member) => member.userId))
    return (users.data ?? []).filter((user) => !ids.has(user.id))
  }, [members.data, users.data])

  const toUser = (member: ProjectMember): AppUser => ({
    id: member.userId,
    email: member.email,
    fullName: member.fullName,
    accountRole: member.accountRole,
    crewRole: member.crewRole,
  })

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const member = pendingRemove
    setPendingRemove(null)
    try {
      await removeMember.mutateAsync(member.userId)
      toast.success('Miembro retirado del proyecto')
    } catch (error) {
      toast.error(
        DomainError.is(error, 'CONFLICT')
          ? 'Esta persona está en una cuadrilla. Quítala de la cuadrilla primero.'
          : messageOf(error, 'No se pudo retirar'),
      )
    }
  }

  if (members.isPending) return <Loading />
  if (members.isError) return <ErrorState message="No se pudieron cargar los miembros." onRetry={() => void members.refetch()} />

  const grouped: Array<[string, ProjectMember[]]> = [
    ['Administradores', members.data.filter((member) => member.accountRole === 'ADMIN')],
    ...CREW_ROLES.map((role): [string, ProjectMember[]] => [
      roleLabel[role],
      members.data.filter((member) => member.accountRole === 'OPERATOR' && member.crewRole === role),
    ]),
    ['Operadores sin cargo', members.data.filter((member) => member.accountRole === 'OPERATOR' && member.crewRole === null)],
  ]

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{plural(members.data.length, 'miembro', 'miembros')}</span>
        <Button variant="tonal" size="sm" icon={<UserPlus />} onClick={() => setAdding(true)}>
          Agregar existente
        </Button>
      </div>
      {members.data.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Sin miembros"
          body="Crea usuarios o agrega usuarios existentes a este proyecto para poder armar cuadrillas."
          action={
            <Button variant="outlined" icon={<UserPlus />} onClick={onNew}>
              Nuevo usuario
            </Button>
          }
        />
      ) : null}
      {grouped
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <section key={title} className="stack" style={{ gap: 6 }}>
            <span className="label">{title}</span>
            <div className="card">
              {list.map((member) => (
                <div key={member.userId} className="list-row admin-row">
                  <span className="icon-badge">{member.accountRole === 'ADMIN' ? <ShieldCheck /> : <User />}</span>
                  <span className="list-row__main">
                    <span className="list-row__title">{member.fullName || member.email}</span>
                    <span className="list-row__sub">
                      {member.email}
                      {member.crewId ? ' · en cuadrilla' : ''}
                    </span>
                  </span>
                  <IconButton label={`Editar ${member.fullName}`} size="sm" onClick={() => onEdit(toUser(member))}>
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Retirar ${member.fullName} del proyecto`}
                    size="sm"
                    danger
                    disabled={member.userId === session.user.id}
                    onClick={() => setPendingRemove(member)}
                  >
                    <UserMinus />
                  </IconButton>
                </div>
              ))}
            </div>
          </section>
        ))}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Agregar al proyecto" icon={<UserPlus />}>
        {users.isPending ? <Loading /> : null}
        {users.data && notMembers.length === 0 ? (
          <p className="dialog__text">Todos los usuarios ya son miembros de este proyecto.</p>
        ) : null}
        <div className="stack" style={{ gap: 4 }}>
          {notMembers.map((user) => (
            <button
              key={user.id}
              type="button"
              className="list-row admin-row admin-row--button"
              disabled={addMember.isPending}
              onClick={async () => {
                try {
                  await addMember.mutateAsync(user.id)
                  toast.success(`${user.fullName} agregado al proyecto`)
                  if (notMembers.length === 1) setAdding(false)
                } catch (error) {
                  toast.error(messageOf(error, 'No se pudo agregar'))
                }
              }}
            >
              <span className="icon-badge">{user.accountRole === 'ADMIN' ? <ShieldCheck /> : <User />}</span>
              <span className="list-row__main">
                <span className="list-row__title">{user.fullName || user.email}</span>
                <span className="list-row__sub">
                  {accountRoleLabel[user.accountRole]}
                  {user.crewRole ? ` · ${roleLabel[user.crewRole]}` : ''}
                </span>
              </span>
              <Plus size={18} />
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="¿Retirar del proyecto?"
        icon={<TriangleAlert />}
        actions={
          <>
            <Button variant="text" onClick={() => setPendingRemove(null)}>
              Cancelar
            </Button>
            <Button variant="text" danger icon={<UserMinus />} onClick={() => void confirmRemove()}>
              Retirar
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          {pendingRemove?.fullName} deja de ver este proyecto. Su cuenta sigue existiendo y puede volver a agregarse.
        </p>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Usuarios (todas las cuentas)                                       */
/* ------------------------------------------------------------------ */

function UsersTab({ onEdit, onNew }: { onEdit: (user: AppUser) => void; onNew: () => void }) {
  const toast = useToast()
  const session = useRequiredSession()
  const users = useUsers()
  const remove = useDeleteUser()
  const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const text = filter.trim().toLowerCase()
    const list = users.data ?? []
    if (!text) return list
    return list.filter((user) => user.fullName.toLowerCase().includes(text) || user.email.toLowerCase().includes(text))
  }, [users.data, filter])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const user = pendingDelete
    setPendingDelete(null)
    try {
      await remove.mutateAsync(user.id)
      toast.success('Usuario eliminado')
    } catch (error) {
      toast.error(
        DomainError.is(error, 'CONFLICT')
          ? 'Este usuario está en una cuadrilla. Quítalo de la cuadrilla primero.'
          : messageOf(error, 'No se pudo eliminar'),
      )
    }
  }

  if (users.isPending) return <Loading />
  if (users.isError) return <ErrorState message="No se pudieron cargar los usuarios." onRetry={() => void users.refetch()} />

  return (
    <>
      <TextField
        label="Buscar"
        type="search"
        icon={<User />}
        placeholder="Nombre o correo"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {users.data.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Sin usuarios"
          body="Crea las cuentas de los técnicos y operadores con su correo, contraseña y cargo."
          action={
            <Button variant="outlined" icon={<UserPlus />} onClick={onNew}>
              Nuevo usuario
            </Button>
          }
        />
      ) : (
        <div className="card">
          {filtered.length === 0 ? <div className="admin-empty">Sin coincidencias</div> : null}
          {filtered.map((user) => (
            <div key={user.id} className="list-row admin-row">
              <span className="icon-badge">{user.accountRole === 'ADMIN' ? <ShieldCheck /> : <User />}</span>
              <span className="list-row__main">
                <span className="list-row__title">
                  {user.fullName || user.email}
                  {user.id === session.user.id ? <span className="badge badge--accent" style={{ marginLeft: 8 }}>Tú</span> : null}
                </span>
                <span className="list-row__sub">
                  {user.email} · {accountRoleLabel[user.accountRole]}
                  {user.crewRole ? ` · ${roleLabel[user.crewRole]}` : ''}
                </span>
              </span>
              <IconButton label={`Editar ${user.fullName}`} size="sm" onClick={() => onEdit(user)}>
                <Pencil />
              </IconButton>
              <IconButton
                label={`Eliminar ${user.fullName}`}
                size="sm"
                danger
                disabled={user.id === session.user.id}
                onClick={() => setPendingDelete(user)}
              >
                <Trash2 />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar usuario?"
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
          La cuenta de {pendingDelete?.fullName} ({pendingDelete?.email}) se elimina de todos los proyectos. No se puede
          deshacer.
        </p>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Diálogo de usuario (crear / editar)                                */
/* ------------------------------------------------------------------ */

function UserDialog({ open, user, onClose }: { open: boolean; user: AppUser | null; onClose: () => void }) {
  const toast = useToast()
  const session = useRequiredSession()
  const users = useUsers(open)
  const create = useCreateUser()
  const update = useUpdateUser()

  // El padre remonta este diálogo (key) cada vez que se abre, así el estado inicial basta.
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accountRole, setAccountRole] = useState<AccountRole>(user?.accountRole ?? 'OPERATOR')
  const [crewRole, setCrewRole] = useState<CrewRole | ''>(user?.crewRole ?? '')
  const [touched, setTouched] = useState(false)
  const [copied, setCopied] = useState(false)

  const otherEmails = (users.data ?? []).filter((item) => item.id !== user?.id).map((item) => item.email)
  const nameError = validateName(fullName)
  const emailError = validateEmail(email, otherEmails)
  const passwordError = user && password.length === 0 ? null : validatePassword(password)
  const crewRoleError = accountRole === 'OPERATOR' && crewRole === '' ? 'Un operador necesita un cargo de cuadrilla' : null
  const editingSelf = user?.id === session.user.id
  const isValid = !nameError && !emailError && !passwordError && !crewRoleError
  const busy = create.isPending || update.isPending

  const generate = () => {
    setPassword(generatePassword())
    setShowPassword(true)
    setCopied(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!isValid) return
    const resolvedCrewRole: CrewRole | null = accountRole === 'OPERATOR' && crewRole !== '' ? crewRole : null
    try {
      if (user) {
        await update.mutateAsync({
          userId: user.id,
          patch: {
            fullName: normalizeName(fullName),
            email: normalizeEmail(email),
            accountRole,
            crewRole: resolvedCrewRole,
            ...(password ? { password } : {}),
          },
        })
        toast.success('Usuario actualizado')
      } else {
        await create.mutateAsync({
          fullName: normalizeName(fullName),
          email: normalizeEmail(email),
          password,
          accountRole,
          crewRole: resolvedCrewRole,
        })
        toast.success('Usuario creado y agregado al proyecto')
      }
      onClose()
    } catch (error) {
      toast.error(DomainError.is(error, 'CONFLICT') ? 'Ese correo ya está registrado' : messageOf(error, 'No se pudo guardar'))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      icon={user ? <Pencil /> : <UserPlus />}
      locked={busy}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" icon={<Check />} loading={busy}>
            {user ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <form id="user-form" className="stack" onSubmit={submit} noValidate>
        <TextField
          label="Nombre completo"
          icon={<User />}
          autoComplete="off"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={touched && nameError ? nameErrorText[nameError] : null}
        />
        <TextField
          label="Correo"
          type="email"
          icon={<Mail />}
          autoComplete="off"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={touched && emailError ? emailErrorText[emailError] : null}
        />
        <TextField
          label={user ? 'Nueva contraseña (opcional)' : 'Contraseña'}
          type={showPassword ? 'text' : 'password'}
          icon={<KeyRound />}
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setCopied(false)
          }}
          error={touched && passwordError ? passwordErrorText[passwordError] : null}
          hint={user && !password ? 'Déjala vacía para conservar la actual' : undefined}
          trailing={
            <>
              {password ? (
                <IconButton size="sm" label={copied ? 'Copiada' : 'Copiar contraseña'} onClick={() => void copy()}>
                  {copied ? <Check /> : <Copy />}
                </IconButton>
              ) : null}
              <IconButton size="sm" label="Generar contraseña" onClick={generate}>
                <Wand2 />
              </IconButton>
              <IconButton size="sm" label={showPassword ? 'Ocultar' : 'Mostrar'} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff /> : <Eye />}
              </IconButton>
            </>
          }
        />
        <SelectField
          label="Rol de la cuenta"
          icon={<Shield />}
          value={accountRole}
          disabled={editingSelf}
          hint={editingSelf ? 'No puedes cambiar tu propio rol' : undefined}
          onChange={(event) => setAccountRole(event.target.value as AccountRole)}
        >
          {ACCOUNT_ROLES.map((role) => (
            <option key={role} value={role}>
              {accountRoleLabel[role]}
            </option>
          ))}
        </SelectField>
        {accountRole === 'OPERATOR' ? (
          <SelectField
            label="Cargo en cuadrilla"
            icon={<Users />}
            value={crewRole}
            placeholder="Selecciona…"
            onChange={(event) => setCrewRole(event.target.value as CrewRole | '')}
            error={touched ? crewRoleError : null}
          >
            {CREW_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel[role]}
              </option>
            ))}
          </SelectField>
        ) : (
          <InlineMessage kind="info" icon={<ShieldCheck />}>
            Un administrador gestiona todo el proyecto y no ocupa cargos en cuadrillas.
          </InlineMessage>
        )}
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Proyectos                                                          */
/* ------------------------------------------------------------------ */

function ProjectsTab() {
  const toast = useToast()
  const session = useRequiredSession()
  const { session: sessionRepo } = useContainer()
  const projects = useProjects()
  const create = useCreateProject()
  const rename = useRenameProject()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [name, setName] = useState('')

  const nameError = name.trim().length < 2 ? 'Usa al menos 2 caracteres' : null
  const duplicate = (projects.data ?? []).some(
    (project) => project.id !== renaming?.id && project.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )

  const openCreate = () => {
    setName('')
    setCreating(true)
  }
  const openRename = (project: Project) => {
    setName(project.name)
    setRenaming(project)
  }
  const close = () => {
    setCreating(false)
    setRenaming(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (nameError || duplicate) return
    try {
      if (renaming) {
        await rename.mutateAsync({ projectId: renaming.id, name: name.trim() })
        toast.success('Proyecto renombrado')
      } else {
        const created = await create.mutateAsync(name.trim())
        toast.success(`Proyecto «${created.name}» creado`)
      }
      close()
    } catch (error) {
      toast.error(DomainError.is(error, 'CONFLICT') ? 'Ya existe un proyecto con ese nombre' : messageOf(error, 'No se pudo guardar'))
    }
  }

  if (projects.isPending) return <Loading />
  if (projects.isError) return <ErrorState message="No se pudieron cargar los proyectos." onRetry={() => void projects.refetch()} />

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{plural(projects.data.length, 'proyecto', 'proyectos')}</span>
        <Button variant="tonal" size="sm" icon={<FolderPlus />} onClick={openCreate}>
          Nuevo proyecto
        </Button>
      </div>
      <div className="card">
        {projects.data.map((project) => {
          const active = project.id === session.projectId
          return (
            <div key={project.id} className="list-row admin-row">
              <span className={['icon-badge', active ? 'icon-badge--hi' : ''].join(' ')}>
                <Boxes />
              </span>
              <span className="list-row__main">
                <span className="list-row__title">
                  {project.name}
                  {active ? <span className="badge badge--accent" style={{ marginLeft: 8 }}>Activo</span> : null}
                </span>
              </span>
              {!active ? (
                <Button variant="text" size="sm" onClick={() => sessionRepo.switchProject(project.id)}>
                  Abrir
                </Button>
              ) : null}
              <IconButton label={`Renombrar ${project.name}`} size="sm" onClick={() => openRename(project)}>
                <Pencil />
              </IconButton>
            </div>
          )
        })}
      </div>
      <InlineMessage kind="info" icon={<Boxes />}>
        Cada proyecto tiene sus propias cuadrillas, vehículos, inventario y mapa. Los usuarios se comparten y se agregan como
        miembros.
      </InlineMessage>

      <Dialog
        open={creating || renaming !== null}
        onClose={close}
        title={renaming ? 'Renombrar proyecto' : 'Nuevo proyecto'}
        icon={<Boxes />}
        locked={create.isPending || rename.isPending}
        actions={
          <>
            <Button variant="text" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" form="project-form" loading={create.isPending || rename.isPending} disabled={!!nameError || duplicate}>
              {renaming ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={submit} noValidate>
          <TextField
            label="Nombre del proyecto"
            icon={<Boxes />}
            autoFocus
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={duplicate ? 'Ya existe un proyecto con ese nombre' : null}
          />
        </form>
      </Dialog>
    </>
  )
}
