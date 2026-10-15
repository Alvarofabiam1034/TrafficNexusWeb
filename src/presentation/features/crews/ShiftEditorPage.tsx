import { CalendarDays, Check, Clock, Moon, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { useIsAdmin } from '@/application/ContainerContext'
import { useCrews, useDeleteShift, useSaveShift } from '@/application/hooks/useCrews'
import { messageOf } from '@/domain/errors'
import type { Crew } from '@/domain/model/crew'
import { WEEKDAYS, type CrewShift, type Weekday } from '@/domain/model/shift'
import type { ShiftDraft } from '@/domain/repository'
import { parseIso, toIso, today } from '@/domain/schedule/civilDate'
import { MAX_HANDOVER_MINUTES, plateShareError, sortShifts } from '@/domain/schedule/scheduleRules'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, InlineMessage, Loading } from '@/presentation/components/States'
import { Switch } from '@/presentation/components/Switch'
import { useToast } from '@/presentation/components/Toast'
import { weekdayChip } from '@/presentation/i18n/labels'
import { formatMinute, shiftSummary } from '@/presentation/i18n/shiftText'

import './crews.css'

export default function ShiftEditorPage() {
  const { crewId = '' } = useParams<{ crewId: string }>()
  const crews = useCrews()

  if (crews.isPending) return <Loading />
  if (crews.isError) return <ErrorState message="No se pudo cargar la cuadrilla." onRetry={() => void crews.refetch()} />
  const crew = crews.data.find((item) => item.id === crewId)
  if (!crew) return <Navigate to={routes.crews} replace />
  return <ShiftEditor crew={crew} others={crews.data.filter((item) => item.id !== crewId)} />
}

type ShiftMode = 'HABITUAL' | 'DATED'

interface EditorState {
  shiftId: string | null
  mode: ShiftMode
  weekdays: Set<Weekday>
  date: string
  holiday: boolean
  start: string
  end: string
}

const emptyEditor = (): EditorState => ({
  shiftId: null,
  mode: 'HABITUAL',
  weekdays: new Set<Weekday>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
  date: toIso(today()),
  holiday: false,
  start: '06:00',
  end: '14:00',
})

const fromShift = (shift: CrewShift): EditorState => ({
  shiftId: shift.id,
  mode: shift.date ? 'DATED' : 'HABITUAL',
  weekdays: new Set(shift.weekdays),
  date: shift.date ? toIso(shift.date) : toIso(today()),
  holiday: shift.holiday,
  start: formatMinute(shift.startMinute),
  end: formatMinute(shift.endMinute),
})

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function ShiftEditor({ crew, others }: { crew: Crew; others: readonly Crew[] }) {
  const isAdmin = useIsAdmin()
  const toast = useToast()
  const save = useSaveShift()
  const remove = useDeleteShift()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CrewShift | null>(null)

  const sorted = useMemo(() => sortShifts(crew.shifts), [crew.shifts])
  const habitual = sorted.filter((shift) => shift.date === null)
  const dated = sorted.filter((shift) => shift.date !== null)

  // Validación del borrador
  const draft = useMemo((): { draft: ShiftDraft | null; error: string | null; overnight: boolean } => {
    if (!editor) return { draft: null, error: null, overnight: false }
    const start = parseTime(editor.start)
    const end = parseTime(editor.end)
    if (start === null || end === null) return { draft: null, error: 'Ingresa horas válidas', overnight: false }
    if (start === end) return { draft: null, error: 'El turno debe durar al menos un minuto', overnight: false }
    const overnight = end < start
    if (editor.mode === 'HABITUAL' && editor.weekdays.size === 0) {
      return { draft: null, error: 'Elige al menos un día', overnight }
    }
    const date = editor.mode === 'DATED' ? parseIso(editor.date) : null
    if (editor.mode === 'DATED' && !date) return { draft: null, error: 'Ingresa una fecha válida', overnight }
    const candidate: ShiftDraft = {
      startMinute: start,
      endMinute: end,
      weekdays: editor.mode === 'HABITUAL' ? new Set(editor.weekdays) : new Set<Weekday>(),
      date,
      holiday: editor.mode === 'DATED' ? editor.holiday : false,
    }
    // Regla del relevo: con los turnos resultantes, ¿la placa se cruza > 60 min?
    const resulting: CrewShift[] = [
      ...crew.shifts.filter((shift) => shift.id !== editor.shiftId),
      { id: editor.shiftId ?? '__new__', ...candidate },
    ]
    const shareError = plateShareError(crew.vehiclePlate, resulting, others)
    if (shareError === 'OVERLAP') {
      return {
        draft: null,
        error: `Con este turno, la placa ${formatPlate(crew.vehiclePlate)} se cruzaría más de ${MAX_HANDOVER_MINUTES} minutos con otra cuadrilla (o consigo misma).`,
        overnight,
      }
    }
    return { draft: candidate, error: null, overnight }
  }, [editor, crew, others])

  const submit = async () => {
    if (!editor || !draft.draft) return
    try {
      await save.mutateAsync({ crewId: crew.id, shiftId: editor.shiftId, draft: draft.draft })
      toast.success(editor.shiftId ? 'Turno actualizado' : 'Turno agregado')
      setEditor(null)
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo guardar el turno'))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const shift = pendingDelete
    setPendingDelete(null)
    try {
      await remove.mutateAsync({ crewId: crew.id, shiftId: shift.id })
      toast.success('Turno eliminado')
    } catch (error) {
      toast.error(messageOf(error, 'No se pudo eliminar el turno'))
    }
  }

  const toggleDay = (day: Weekday) =>
    setEditor((prev) => {
      if (!prev) return prev
      const weekdays = new Set(prev.weekdays)
      if (weekdays.has(day)) weekdays.delete(day)
      else weekdays.add(day)
      return { ...prev, weekdays }
    })

  return (
    <>
      <PageHeader
        title="Horario"
        subtitle={`${crew.leadTechnician.fullName} · ${formatPlate(crew.vehiclePlate)}`}
        backTo={routes.crews}
        actions={
          isAdmin ? (
            <IconButton label="Agregar turno" accent onClick={() => setEditor(emptyEditor())}>
              <Plus />
            </IconButton>
          ) : undefined
        }
      />
      <div className="page-body">
        {crew.shifts.length === 0 ? (
          <EmptyState
            icon={<Clock />}
            title="Sin turnos"
            body="Define el turno habitual de la cuadrilla (los días que se repite) y agrega turnos para fechas puntuales o festivos."
            action={
              isAdmin ? (
                <Button variant="outlined" icon={<Plus />} onClick={() => setEditor(emptyEditor())}>
                  Agregar turno
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {habitual.length > 0 ? (
          <section className="stack">
            <span className="label">Habitual</span>
            <div className="card">
              {habitual.map((shift) => (
                <ShiftRow
                  key={shift.id}
                  shift={shift}
                  canEdit={isAdmin}
                  onEdit={() => setEditor(fromShift(shift))}
                  onDelete={() => setPendingDelete(shift)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {dated.length > 0 ? (
          <section className="stack">
            <span className="label">Fechas puntuales</span>
            <div className="card">
              {dated.map((shift) => (
                <ShiftRow
                  key={shift.id}
                  shift={shift}
                  canEdit={isAdmin}
                  onEdit={() => setEditor(fromShift(shift))}
                  onDelete={() => setPendingDelete(shift)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <InlineMessage kind="info" icon={<TriangleAlert />}>
          Si dos cuadrillas comparten placa, sus turnos solo pueden cruzarse hasta {MAX_HANDOVER_MINUTES} minutos
          para el relevo. Un turno de fecha marcado como festivo reemplaza el habitual de ese día.
        </InlineMessage>
      </div>

      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.shiftId ? 'Editar turno' : 'Nuevo turno'}
        icon={<Clock />}
        locked={save.isPending}
        actions={
          <>
            <Button variant="text" onClick={() => setEditor(null)}>
              Cancelar
            </Button>
            <Button icon={<Check />} loading={save.isPending} disabled={!draft.draft} onClick={() => void submit()}>
              Guardar
            </Button>
          </>
        }
      >
        {editor ? (
          <div className="stack">
            <div className="segmented" role="group" aria-label="Tipo de turno">
              <button
                type="button"
                aria-pressed={editor.mode === 'HABITUAL'}
                onClick={() => setEditor({ ...editor, mode: 'HABITUAL' })}
              >
                Habitual
              </button>
              <button
                type="button"
                aria-pressed={editor.mode === 'DATED'}
                onClick={() => setEditor({ ...editor, mode: 'DATED' })}
              >
                Fecha puntual
              </button>
            </div>

            {editor.mode === 'HABITUAL' ? (
              <div className="chip-row" role="group" aria-label="Días de la semana">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={['chip', editor.weekdays.has(day) ? 'chip--selected' : ''].join(' ')}
                    aria-pressed={editor.weekdays.has(day)}
                    onClick={() => toggleDay(day)}
                  >
                    {weekdayChip[day]}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <TextField
                  label="Fecha"
                  type="date"
                  icon={<CalendarDays />}
                  value={editor.date}
                  onChange={(event) => setEditor({ ...editor, date: event.target.value })}
                />
                <label className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <div>Festivo</div>
                    <div className="muted" style={{ fontSize: '0.8125rem' }}>
                      Ese día no sale el turno habitual
                    </div>
                  </span>
                  <Switch
                    checked={editor.holiday}
                    onChange={(holiday) => setEditor({ ...editor, holiday })}
                    label="Festivo"
                  />
                </label>
              </>
            )}

            <div className="time-inputs">
              <TextField
                label="Inicio"
                type="time"
                value={editor.start}
                onChange={(event) => setEditor({ ...editor, start: event.target.value })}
              />
              <TextField
                label="Fin"
                type="time"
                value={editor.end}
                onChange={(event) => setEditor({ ...editor, end: event.target.value })}
              />
            </div>

            {draft.overnight && !draft.error ? (
              <InlineMessage kind="info" icon={<Moon />}>
                Termina al día siguiente.
              </InlineMessage>
            ) : null}
            {draft.error ? <InlineMessage>{draft.error}</InlineMessage> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar turno?"
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
        <p className="dialog__text">{pendingDelete ? shiftSummary(pendingDelete) : ''}</p>
      </Dialog>
    </>
  )
}

function ShiftRow({
  shift,
  canEdit,
  onEdit,
  onDelete,
}: {
  shift: CrewShift
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const overnight = shift.endMinute <= shift.startMinute
  return (
    <div className="shift-row list-row">
      <span className="icon-badge">{shift.date ? <CalendarDays /> : <Clock />}</span>
      <span className="shift-row__text">
        {shiftSummary(shift)}
        {overnight ? (
          <span className="badge badge--primary shift-row__badge" title="Termina al día siguiente">
            <Moon size={12} /> nocturno
          </span>
        ) : null}
      </span>
      {canEdit ? (
        <>
          <IconButton label="Editar turno" size="sm" onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton label="Eliminar turno" size="sm" danger onClick={onDelete}>
            <Trash2 />
          </IconButton>
        </>
      ) : null}
    </div>
  )
}
