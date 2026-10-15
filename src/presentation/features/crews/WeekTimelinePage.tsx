import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'

import { useCrews } from '@/application/hooks/useCrews'
import type { Crew } from '@/domain/model/crew'
import { WEEKDAYS } from '@/domain/model/shift'
import { numericLabel, plusDays, startOfWeek, today, type CivilDate } from '@/domain/schedule/civilDate'
import {
  MAX_HANDOVER_MINUTES,
  materializeWeek,
  overlaps,
  portionOnDay,
  type ShiftSpan,
  type SpanOverlap,
} from '@/domain/schedule/scheduleRules'
import { formatPlate } from '@/domain/validation/crewValidator'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { PageHeader } from '@/presentation/components/PageHeader'
import { EmptyState, ErrorState, Loading } from '@/presentation/components/States'
import { weekdayShort } from '@/presentation/i18n/labels'

import './crews.css'

const HANDOVER_COLOR = '#F9A825'
const CLASH_COLOR = '#C62828'
const COLUMN_HEIGHT = 288

/** Paleta estable por índice de cuadrilla, igual que la app. */
const CREW_COLORS = ['#00D6A0', '#4FC3F7', '#BA68C8', '#FFB74D', '#81C784', '#F06292', '#A1887F', '#90A4AE']

export default function WeekTimelinePage() {
  const crews = useCrews()
  const [weekStart, setWeekStart] = useState<CivilDate>(() => startOfWeek(today()))
  const isCurrentWeek = useMemo(() => {
    const current = startOfWeek(today())
    return current.year === weekStart.year && current.month === weekStart.month && current.day === weekStart.day
  }, [weekStart])

  const data = useMemo(() => {
    if (!crews.data) return null
    const spans = materializeWeek(crews.data, weekStart)
    const found = overlaps(spans)
    return { spans, overlaps: found }
  }, [crews.data, weekStart])

  const weekEnd = plusDays(weekStart, 6)

  return (
    <>
      <PageHeader
        title="Semana"
        subtitle="Turnos por cuadrilla y relevos de vehículo"
        backTo={routes.crews}
        actions={
          !isCurrentWeek ? (
            <Button variant="text" size="sm" icon={<CalendarDays />} onClick={() => setWeekStart(startOfWeek(today()))}>
              Hoy
            </Button>
          ) : undefined
        }
      />
      <div className="page-body">
        <div className="week-nav">
          <IconButton label="Semana anterior" onClick={() => setWeekStart(plusDays(weekStart, -7))}>
            <ChevronLeft />
          </IconButton>
          <h2>
            {numericLabel(weekStart)} – {numericLabel(weekEnd)}
          </h2>
          <IconButton label="Semana siguiente" onClick={() => setWeekStart(plusDays(weekStart, 7))}>
            <ChevronRight />
          </IconButton>
        </div>

        {crews.isPending ? <Loading /> : null}
        {crews.isError ? <ErrorState message="No se pudo cargar la semana." onRetry={() => void crews.refetch()} /> : null}

        {crews.data && data ? (
          crews.data.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Sin cuadrillas" body="Cuando existan cuadrillas con horario, aquí verás su semana." />
          ) : (
            <>
              <div className="week-legend">
                {crews.data.map((crew, index) => (
                  <span key={crew.id} style={{ '--legend-color': colorFor(index) } as CSSProperties}>
                    Cuadrilla {index + 1} · {formatPlate(crew.vehiclePlate)}
                  </span>
                ))}
                <span style={{ '--legend-color': HANDOVER_COLOR } as CSSProperties}>
                  Relevo (≤ {MAX_HANDOVER_MINUTES} min)
                </span>
                <span style={{ '--legend-color': CLASH_COLOR } as CSSProperties}>Cruce excesivo</span>
              </div>

              <div className="stack" style={{ gap: 20 }}>
                {crews.data.map((crew, index) => (
                  <CrewWeek
                    key={crew.id}
                    crew={crew}
                    number={index + 1}
                    color={colorFor(index)}
                    weekStart={weekStart}
                    spans={data.spans.filter((span) => span.crewId === crew.id)}
                    overlaps={data.overlaps.filter(
                      (overlap) => overlap.left.crewId === crew.id || overlap.right.crewId === crew.id,
                    )}
                  />
                ))}
              </div>
            </>
          )
        ) : null}
      </div>
    </>
  )
}

function colorFor(index: number): string {
  return CREW_COLORS[index % CREW_COLORS.length] ?? CREW_COLORS[0]!
}

function CrewWeek({
  crew,
  number,
  color,
  weekStart,
  spans,
  overlaps: crewOverlaps,
}: {
  crew: Crew
  number: number
  color: string
  weekStart: CivilDate
  spans: readonly ShiftSpan[]
  overlaps: readonly SpanOverlap[]
}) {
  const days = WEEKDAYS.map((_, index) => plusDays(weekStart, index))
  const hours = [0, 6, 12, 18, 24]
  return (
    <section className="week-crew">
      <div className="week-crew__title" style={{ color }}>
        Cuadrilla {number} · {crew.leadTechnician.fullName} · {formatPlate(crew.vehiclePlate)}
      </div>
      <div className="week-grid" style={{ '--week-col-height': `${COLUMN_HEIGHT}px` } as CSSProperties}>
        <div />
        {days.map((day, index) => (
          <div key={index} className="week-grid__day">
            {weekdayShort[WEEKDAYS[index]!]}
            <br />
            {day.day}
          </div>
        ))}

        <div className="week-hours" aria-hidden>
          {hours.map((hour) => (
            <span key={hour} style={{ top: `${(hour / 24) * 100}%` }}>
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>
        {days.map((day, index) => (
          <div key={index} className="week-col" aria-label={numericLabel(day)}>
            {hours.slice(1, -1).map((hour) => (
              <div key={hour} className="week-col__grid" style={{ top: `${(hour / 24) * 100}%` }} />
            ))}
            {spans.map((span) => {
              const portion = portionOnDay(span.startMinute, span.endMinute, day)
              if (!portion) return null
              return (
                <div
                  key={`${span.shiftId}-${span.startMinute}`}
                  className="week-span"
                  style={{
                    top: `${portion.offset * 100}%`,
                    height: `${portion.length * 100}%`,
                    background: color,
                    opacity: span.holiday ? 0.7 : 0.9,
                  }}
                  title={span.holiday ? 'Turno de festivo' : undefined}
                />
              )
            })}
            {crewOverlaps.map((overlap, overlapIndex) => {
              const portion = portionOnDay(overlap.overlapStart, overlap.overlapEnd, day)
              if (!portion) return null
              const clash = overlap.minutes > MAX_HANDOVER_MINUTES
              return (
                <div
                  key={`ov-${overlapIndex}`}
                  className="week-span"
                  style={{
                    top: `${portion.offset * 100}%`,
                    height: `${portion.length * 100}%`,
                    background: clash ? CLASH_COLOR : HANDOVER_COLOR,
                    left: 6,
                    right: 6,
                  }}
                  title={clash ? `Cruce de ${overlap.minutes} min` : `Relevo de ${overlap.minutes} min`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
