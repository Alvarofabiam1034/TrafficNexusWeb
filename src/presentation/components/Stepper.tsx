import { Minus, Plus } from 'lucide-react'

import { clampQuantity, MAX_QUANTITY } from '@/domain/kit/kitRules'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  label: string
  min?: number
  max?: number
  disabled?: boolean
}

/** Control de cantidad entera con botones y entrada directa, acotado a 0..9999. */
export function Stepper({ value, onChange, label, min = 0, max = MAX_QUANTITY, disabled }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, clampQuantity(next))))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Restar uno" disabled={disabled || value <= min} onClick={() => set(value - 1)}>
        <Minus />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          set(Number.isNaN(parsed) ? min : parsed)
        }}
        onFocus={(event) => event.target.select()}
      />
      <button type="button" aria-label="Sumar uno" disabled={disabled || value >= max} onClick={() => set(value + 1)}>
        <Plus />
      </button>
    </div>
  )
}
