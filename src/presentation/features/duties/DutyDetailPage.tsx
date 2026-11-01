import { useParams } from 'react-router-dom'

import { useCrews } from '@/application/hooks/useCrews'
import { useDutyDetail } from '@/application/hooks/useDuties'
import {
  dutyStateLabel,
  toolReviewRows,
  type ChecklistMark,
  type DutyChecklist,
  type ToolOutcome,
} from '@/domain/model/duty'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { PageHeader } from '@/presentation/components/PageHeader'
import { ErrorState, Loading } from '@/presentation/components/States'
import { formatDateTime } from '@/presentation/i18n/labels'

import '../workOrders/workOrders.css'
import './duties.css'

const MARK_LABEL: Record<ChecklistMark, string> = {
  OK: 'OK',
  MISSING: 'Falta',
  PENDING: 'Pendiente',
}

const OUTCOME: Record<ToolOutcome, { label: string; chip: string }> = {
  LOST: { label: 'Perdida en la jornada', chip: 'ot-chip ot-chip--cancelled' },
  STILL_MISSING: { label: 'Ya faltaba al abrir', chip: 'ot-chip ot-chip--progress' },
  MISSING_AT_OPEN: { label: 'Faltaba al abrir', chip: 'ot-chip ot-chip--progress' },
  RECOVERED: { label: 'Recuperada', chip: 'ot-chip ot-chip--assigned' },
  NOT_REVIEWED: { label: 'Sin revisión de cierre', chip: 'ot-chip ot-chip--draft' },
  OK: { label: 'OK', chip: 'ot-chip ot-chip--done' },
}

export default function DutyDetailPage() {
  const { dutyId = '' } = useParams()
  const detail = useDutyDetail(dutyId)
  const crews = useCrews()

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

  return (
    <>
      <PageHeader
        title={`Jornada ${formatPlate(duty.plate)}`}
        subtitle={crew ? crew.leadTechnician.fullName : undefined}
        backTo={routes.duties}
      />
      <div className="page-body">
        <div className="ot-detail duty-detail">
          <div className="duty-chips duty-chips--start">
            <span className={duty.state === 'OPEN' ? 'ot-chip ot-chip--assigned' : 'ot-chip'}>
              {dutyStateLabel(duty.state)}
            </span>
            {handover ? <span className="ot-chip ot-chip--status">Recibió el carro por traspaso</span> : null}
            {duty.regularizedFromDutyId ? <span className="ot-chip ot-chip--status">Regularizada</span> : null}
          </div>

          <dl className="duty-facts">
            <div>
              <dt>Apertura</dt>
              <dd>
                {formatDateTime(duty.openedAt)} · {duty.openedByName || '—'}
              </dd>
            </div>
            <div>
              <dt>Cierre</dt>
              <dd>{duty.closedAt ? `${formatDateTime(duty.closedAt)} · ${duty.closedByName || '—'}` : 'Abierta'}</dd>
            </div>
            {duty.closeReason ? (
              <div>
                <dt>Motivo de cierre</dt>
                <dd>{duty.closeReason}</dd>
              </div>
            ) : null}
            <ChecklistFact label={handover ? 'Checklist de recepción' : 'Checklist de apertura'} checklist={openChecklist} />
            <ChecklistFact label="Checklist de cierre" checklist={closeChecklist} />
          </dl>

          {handover && rows.some((row) => row.openMark === 'MISSING') ? (
            <p className="duty-note">
              Los faltantes al recibir corresponden a la cuadrilla que tenía el carro antes y no hizo su cierre.
            </p>
          ) : null}

          <section className="ot-detail__block">
            <h2>Herramienta</h2>
            {rows.length === 0 ? (
              <p className="duty-note">La jornada no tiene checklist registrado.</p>
            ) : (
              <div className="duty-table-wrap">
                <table className="ot-table">
                  <thead>
                    <tr>
                      <th>Herramienta</th>
                      <th>{handover ? 'Recepción' : 'Apertura'}</th>
                      <th>Cierre</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const identity = [row.brand, row.serial].filter(Boolean).join(' · ')
                      return (
                        <tr key={row.itemId} className={row.outcome === 'LOST' ? 'duty-row--lost' : undefined}>
                          <td>
                            <div className="duty-tool">{row.itemName}</div>
                            <div className="duty-tool__meta">
                              {[row.groupName, identity].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td>{row.openMark ? MARK_LABEL[row.openMark] : '—'}</td>
                          <td>{row.closeMark ? MARK_LABEL[row.closeMark] : '—'}</td>
                          <td>
                            <span className={OUTCOME[row.outcome].chip}>{OUTCOME[row.outcome].label}</span>
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

function ChecklistFact({ label, checklist }: { label: string; checklist: DutyChecklist | null }) {
  const value = !checklist
    ? 'No realizado'
    : checklist.status === 'COMPLETED'
      ? `Completado ${checklist.completedAt ? formatDateTime(checklist.completedAt) : ''} · ${checklist.completedByName || '—'}`
      : 'En curso'
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
