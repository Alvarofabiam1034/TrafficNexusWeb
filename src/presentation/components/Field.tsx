import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

interface BaseProps {
  label: string
  hint?: string
  error?: string | null
  icon?: ReactNode
  trailing?: ReactNode
  prefix?: string
}

type TextFieldProps = BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'>

export function TextField({ label, hint, error, icon, trailing, prefix, id, disabled, ...rest }: TextFieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const hintId = `${inputId}-hint`
  const message = error ?? hint
  return (
    <div className={['field', error ? 'field--error' : '', disabled ? 'field--disabled' : ''].join(' ')}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control">
        {icon}
        {prefix ? <span className="field__prefix">{prefix}</span> : null}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? hintId : undefined}
          {...rest}
        />
        {trailing}
      </div>
      {message ? (
        <div id={hintId} className="field__hint" role={error ? 'alert' : undefined}>
          {message}
        </div>
      ) : null}
    </div>
  )
}

type TextAreaFieldProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextAreaField({ label, hint, error, id, disabled, ...rest }: TextAreaFieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const hintId = `${inputId}-hint`
  const message = error ?? hint
  return (
    <div className={['field', error ? 'field--error' : '', disabled ? 'field--disabled' : ''].join(' ')}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control field__control--area">
        <textarea
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? hintId : undefined}
          {...rest}
        />
      </div>
      {message ? (
        <div id={hintId} className="field__hint" role={error ? 'alert' : undefined}>
          {message}
        </div>
      ) : null}
    </div>
  )
}

type SelectFieldProps = BaseProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    placeholder?: string
  }

export function SelectField({
  label,
  hint,
  error,
  icon,
  id,
  children,
  placeholder,
  disabled,
  ...rest
}: SelectFieldProps) {
  const generated = useId()
  const selectId = id ?? generated
  const hintId = `${selectId}-hint`
  const message = error ?? hint
  return (
    <div className={['field', error ? 'field--error' : '', disabled ? 'field--disabled' : ''].join(' ')}>
      <label className="field__label" htmlFor={selectId}>
        {label}
      </label>
      <div className="field__control">
        {icon}
        <select
          id={selectId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? hintId : undefined}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {children}
        </select>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {message ? (
        <div id={hintId} className="field__hint" role={error ? 'alert' : undefined}>
          {message}
        </div>
      ) : null}
    </div>
  )
}
