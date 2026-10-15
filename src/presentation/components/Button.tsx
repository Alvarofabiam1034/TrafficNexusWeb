import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'filled' | 'tonal' | 'outlined' | 'text'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  danger?: boolean
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'filled',
  danger = false,
  size = 'md',
  icon,
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    danger ? 'btn--danger' : '',
    size === 'lg' ? 'btn--lg' : size === 'sm' ? 'btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner spinner--sm" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  danger?: boolean
  accent?: boolean
}

export function IconButton({
  label,
  size = 'md',
  danger = false,
  accent = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const classes = [
    'icon-btn',
    size === 'sm' ? 'icon-btn--sm' : '',
    danger ? 'icon-btn--danger' : '',
    accent ? 'icon-btn--accent' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}
