import { ClipboardCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCrews } from '@/application/hooks/useCrews'
import { useDutyHistory } from '@/application/hooks/useDuties'
import { dutyStateLabel, hasToolFindings, type DutyHistoryEntry } from '@/domain/model/duty'
import { plusDays, toIso, today } from '@/domain/schedule/civilDate'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { SelectField, TextField } from '@/presentation/components/Field'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { formatDateTime, plural } from '@/presentation/i18n/labels'

import '../workOrders/workOrders.css'
import './duties.css'

type View = 'ALL' | 'FINDINGS'

export default function DutyListPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(() => toIso(plusDays(today(), -6)))
  const [to, setTo] = useState(() => toIso(today()))
  const [crewId, setCrewId] = useState('')
  const [view, setView] = useState<View>('FINDINGS')
  const crews = useCrews()
  const history = useDutyHistory({ crewId: crewId || undefined, from: from || undefined, to: to || undefined })

  const crewLabel = (entry: DutyHistoryEntry): string => {
    const crew = crews.data?.find((item) => item.id === entry.crewId)
    const plate = formatPlate(entry.plate)
    return crew ? `${plate} · ${crew.leadTechnician.fullName}` : plate
  }

  const entries = useMemo(() => {
    const all = history.data ?? []
    return view === 'FINDINGS' ? all.filter(hasToolFindings) : all
  }, [history.data, view])

  return (
    <>
      <PageHeader title="Jornadas" subtitle="Checklists de herramienta de apertura y cierre" />
      <div className="page-body">
        <div className="duty-filters">
          <TextField label="Desde" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Hasta" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          <SelectField label="Cuadrilla" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            <option value="">Todas</option>
            {(crews.data ?? []).map((crew) => (
              <option key={crew.id} value={crew.id}>
                {formatPlate(crew.vehiclePlate)} · {crew.leadTechnician.fullName}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="ot-filters" role="tablist" aria-label="Filtrar jornadas">
          {(
            [
              ['FINDINGS', 'Con novedades'],
              ['ALL', 'Todas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              className={['ot-filter', view === value ? 'ot-filter--on' : ''].join(' ')}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {history.isPending ? <Loading /> : null}
        {history.isError ? (
          <ErrorState message="No se pudieron cargar las jornadas." onRetry={() => void history.refetch()} />
        ) : null}
        {history.data && entries.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title={view === 'FINDINGS' ? 'Sin novedades de herramienta' : 'No hay jornadas'}
            body={
              view === 'FINDINGS'
                ? 'Ninguna jornada del rango tiene herramienta perdida ni faltantes al abrir.'
                : 'Cuando una cuadrilla abra jornada desde la app aparecerá aquí.'
            }
          />
        ) : null}
        {entries.length > 0 ? (
          <>
            <span className="label">{plural(entries.length, 'jornada', 'jornadas')}</span>
            <div className="ot-list">
              {entries.map((entry) => (
                <DutyCard
                  key={entry.id}
                  entry={entry}
                  crewLabel={crewLabel(entry)}
                  onOpen={() => navigate(routes.duty(entry.id))}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

function DutyCard({ entry, crewLabel, onOpen }: { entry: DutyHistoryEntry; crewLabel: string; onOpen: () => void }) {
  const handover = entry.handoverFromDutyId !== null
  const closeReviewed = entry.closeChecklistStatus === 'COMPLETED'
  return (
    <button type="button" className="ot-card" onClick={onOpen}>
      <div className="ot-card__head">
        <div>
          <div className="ot-card__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} /> {crewLabel}
          </div>
          <div className="ot-card__meta" style={{ marginTop: 4 }}>
            <span>Abrió {formatDateTime(entry.openedAt)} · {entry.openedByName || '—'}</span>
            {entry.closedAt ? (
              <span>Cerró {formatDateTime(entry.closedAt)} · {entry.closedByName || '—'}</span>
            ) : null}
          </div>
        </div>
        <div className="duty-chips">
          <span className={entry.state === 'OPEN' ? 'ot-chip ot-chip--assigned' : 'ot-chip'}>
            {dutyStateLabel(entry.state)}
          </span>
          {entry.lostInDuty > 0 ? (
            <span className="ot-chip ot-chip--cancelled">
              {plural(entry.lostInDuty, 'perdida en la jornada', 'perdidas en la jornada')}
            </span>
          ) : null}
          {entry.missingAtOpen > 0 ? (
            <span className="ot-chip ot-chip--progress">
              {handover
                ? plural(entry.missingAtOpen, 'faltante al recibir', 'faltantes al recibir')
                : plural(entry.missingAtOpen, 'faltante al abrir', 'faltantes al abrir')}
            </span>
          ) : null}
          {entry.state !== 'OPEN' && !closeReviewed ? (
            <span className="ot-chip ot-chip--draft">Sin checklist de cierre</span>
          ) : null}
          {closeReviewed && !hasToolFindings(entry) ? (
            <span className="ot-chip ot-chip--done">Sin novedades</span>
          ) : null}
        </div>
      </div>
      {entry.closeReason ? <div className="ot-card__meta">Motivo de cierre: {entry.closeReason}</div> : null}
    </button>
  )
}
