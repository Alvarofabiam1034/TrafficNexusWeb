import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { useCrews } from '@/application/hooks/useCrews'
import { useDutyDetail } from '@/application/hooks/useDuties'
import {
  dutyStateLabel,
  toolReviewRows,
  type ChecklistMark,
  type DutyChecklist,
  type ToolOutcome,
  type ToolReviewRow,
} from '@/domain/model/duty'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { PageHeader } from '@/presentation/components/PageHeader'
import { ErrorState, Loading } from '@/presentation/components/States'
import { Timeline, TimelineProgress, TimelineStep } from '@/presentation/components/Timeline'
import { formatDateTime } from '@/presentation/i18n/labels'

import './duties.css'

type Tone = 'danger' | 'caution' | 'info' | 'neutral' | 'success'

const MARK: Record<ChecklistMark, { label: string; tone: Tone }> = {
  OK: { label: 'OK', tone: 'success' },
  MISSING: { label: 'Falta', tone: 'danger' },
  PENDING: { label: 'Pendiente', tone: 'neutral' },
}

const OUTCOME: Record<ToolOutcome, { label: string; tone: Tone }> = {
  LOST: { label: 'Perdida en la jornada', tone: 'danger' },
  STILL_MISSING: { label: 'Ya faltaba al abrir', tone: 'caution' },
  MISSING_AT_OPEN: { label: 'Faltaba al abrir', tone: 'caution' },
  RECOVERED: { label: 'Recuperada', tone: 'info' },
  NOT_REVIEWED: { label: 'Sin revisión de cierre', tone: 'neutral' },
  OK: { label: 'OK', tone: 'success' },
}

type FilterKey = 'ALL' | 'LOST' | 'MISSING' | 'RECOVERED' | 'NOT_REVIEWED' | 'OK'

const FILTERS: readonly { key: FilterKey; label: string; tone: Tone | 'accent'; outcomes: readonly ToolOutcome[] }[] = [
  { key: 'ALL', label: 'Herramientas', tone: 'accent', outcomes: [] },
  { key: 'LOST', label: 'Perdidas', tone: 'danger', outcomes: ['LOST'] },
  { key: 'MISSING', label: 'Faltaban al abrir', tone: 'caution', outcomes: ['STILL_MISSING', 'MISSING_AT_OPEN'] },
  { key: 'RECOVERED', label: 'Recuperadas', tone: 'info', outcomes: ['RECOVERED'] },
  { key: 'NOT_REVIEWED', label: 'Sin revisión', tone: 'neutral', outcomes: ['NOT_REVIEWED'] },
  { key: 'OK', label: 'OK', tone: 'success', outcomes: ['OK'] },
]

function matchesFilter(row: ToolReviewRow, key: FilterKey): boolean {
  if (key === 'ALL') return true
  return FILTERS.find((filter) => filter.key === key)?.outcomes.includes(row.outcome) ?? false
}

export default function DutyDetailPage() {
  const { dutyId = '' } = useParams()
  const detail = useDutyDetail(dutyId)
  const crews = useCrews()
  const [filter, setFilter] = useState<FilterKey>('ALL')

  if (detail.isPending) return <Loading />
  if (detail.isError) {
    return (
      <>
        <PageHeader title="Jornada" backTo={routes.duties} />
        <div className="page-body">
          <ErrorState message="No se pudo cargar la jornada." onRetry={() => void detail.refetch()} />
        </div>
      </>
    )
  }

  const { duty, openChecklist, closeChecklist } = detail.data
  const crew = crews.data?.find((item) => item.id === duty.crewId)
  const rows = toolReviewRows(detail.data)
  const handover = duty.handoverFromDutyId !== null
  const isOpen = duty.state === 'OPEN'
  const visibleRows = rows.filter((row) => matchesFilter(row, filter))

  return (
    <>
      <PageHeader
        title={`Jornada ${formatPlate(duty.plate)}`}
        subtitle={crew ? crew.leadTechnician.fullName : undefined}
        backTo={routes.duties}
      />
      <div className="page-body">
        <div className="dd">
          <section className={`dd-hero ${isOpen ? 'dd-hero--open' : 'dd-hero--closed'}`}>
            <div className="dd-hero__head">
              <div className="dd-hero__plate">{formatPlate(duty.plate)}</div>
              <div className="dd-hero__chips">
                <span className={`dd-pill dd-pill--${isOpen ? 'success' : 'neutral'}`}>
                  {isOpen ? <span className="dd-pulse" aria-hidden /> : null}
                  {dutyStateLabel(duty.state)}
                </span>
                {handover ? <span className="dd-pill dd-pill--info">Recibió el carro por traspaso</span> : null}
                {duty.regularizedFromDutyId ? <span className="dd-pill dd-pill--info">Regularizada</span> : null}
              </div>
            </div>

            <Timeline>
              <TimelineStep
                label="Apertura"
                tone="success"
                value={formatDateTime(duty.openedAt)}
                by={duty.openedByName}
              />
              <ChecklistStep
                label={handover ? 'Checklist de recepción' : 'Checklist de apertura'}
                checklist={openChecklist}
              />
              <ChecklistStep label="Checklist de cierre" checklist={closeChecklist} />
              <TimelineStep
                label="Cierre"
                tone={duty.closedAt ? 'success' : 'neutral'}
                value={duty.closedAt ? formatDateTime(duty.closedAt) : 'Jornada en curso'}
                by={duty.closedAt ? duty.closedByName : ''}
              />
            </Timeline>

            {duty.closeReason ? (
              <div className="dd-callout">
                <span className="dd-callout__label">Motivo de cierre</span>
                {duty.closeReason}
              </div>
            ) : null}
          </section>

          {handover && rows.some((row) => row.openMark === 'MISSING') ? (
            <div className="dd-callout dd-callout--caution">
              Los faltantes al recibir corresponden a la cuadrilla que tenía el carro antes y no hizo su cierre.
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="dd-stats" role="group" aria-label="Filtrar herramienta por resultado">
              {FILTERS.map((item) => {
                const count = item.key === 'ALL' ? rows.length : rows.filter((row) => matchesFilter(row, item.key)).length
                const active = filter === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`dd-stat dd-stat--${item.tone}${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                    aria-pressed={active}
                    onClick={() => setFilter(active ? 'ALL' : item.key)}
                  >
                    <span className="dd-stat__value">{count}</span>
                    <span className="dd-stat__label">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}

          <section className="dd-card">
            <header className="dd-card__head">
              <h2>Herramienta</h2>
              {filter !== 'ALL' ? (
                <button type="button" className="dd-link" onClick={() => setFilter('ALL')}>
                  Ver todas
                </button>
              ) : null}
            </header>
            {rows.length === 0 ? (
              <p className="dd-empty">La jornada no tiene checklist registrado.</p>
            ) : visibleRows.length === 0 ? (
              <p className="dd-empty">No hay herramientas con este resultado.</p>
            ) : (
              <div className="dd-table-wrap">
                <table className="dd-table">
                  <thead>
                    <tr>
                      <th>Herramienta</th>
                      <th>{handover ? 'Recepción' : 'Apertura'}</th>
                      <th>Cierre</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const identity = [row.brand, row.serial].filter(Boolean).join(' · ')
                      const outcome = OUTCOME[row.outcome]
                      return (
                        <tr key={row.itemId} className={`dd-row dd-row--${outcome.tone}`}>
                          <td>
                            <div className="dd-tool">{row.itemName}</div>
                            <div className="dd-tool__meta">
                              {row.groupName ? <span className="dd-tag">{row.groupName}</span> : null}
                              {identity ? <span>{identity}</span> : null}
                            </div>
                          </td>
                          <td>
                            <MarkCell mark={row.openMark} comment={row.openComment} />
                          </td>
                          <td>
                            <MarkCell mark={row.closeMark} comment={row.closeComment} />
                          </td>
                          <td>
                            <span className={`dd-badge dd-badge--${outcome.tone}`}>{outcome.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

function ChecklistStep({ label, checklist }: { label: string; checklist: DutyChecklist | null }) {
  if (!checklist) return <TimelineStep label={label} tone="neutral" value="No realizado" />
  const total = checklist.lines.length
  const marked = checklist.lines.filter((line) => line.mark !== 'PENDING').length
  const percent = total === 0 ? 0 : Math.round((marked / total) * 100)
  if (checklist.status === 'COMPLETED') {
    return (
      <TimelineStep
        label={label}
        tone="success"
        value={checklist.completedAt ? formatDateTime(checklist.completedAt) : 'Completado'}
        by={checklist.completedByName}
      />
    )
  }
  return (
    <TimelineStep label={label} tone="caution" value="En curso" by={`${marked} de ${total} revisadas`}>
      <TimelineProgress percent={percent} />
    </TimelineStep>
  )
}

function MarkCell({ mark, comment }: { mark: ChecklistMark | null; comment: string }) {
  if (!mark) return <span className="dd-muted">—</span>
  const { label, tone } = MARK[mark]
  return (
    <div className="dd-mark">
      <span className={`dd-mark__pill dd-mark__pill--${tone}`}>{label}</span>
      {comment ? <div className="dd-mark__comment">{comment}</div> : null}
    </div>
  )
}
