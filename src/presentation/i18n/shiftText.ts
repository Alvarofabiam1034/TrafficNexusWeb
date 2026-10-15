import type { CrewShift, Weekday } from '@/domain/model/shift'
import { numericLabel } from '@/domain/schedule/civilDate'
import { weekdayLabelOf } from '@/domain/schedule/weekdaySpans'

import { weekdayShort } from './labels'

export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function weekdayText(days: ReadonlySet<Weekday>): string {
  const label = weekdayLabelOf(days)
  switch (label.kind) {
    case 'all':
      return 'todos los días'
    case 'run':
      return label.from === label.to
        ? weekdayShort[label.from]
        : `${weekdayShort[label.from]} a ${weekdayShort[label.to]}`
    case 'list':
      return label.days.map((day) => weekdayShort[day]).join(', ')
  }
}

export function shiftSummary(shift: CrewShift): string {
  const time = `${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}`
  if (shift.date === null) return `${time} · ${weekdayText(shift.weekdays)}`
  const date = numericLabel(shift.date)
  return shift.holiday ? `${date} · ${time} · festivo` : `${date} · ${time}`
}
