import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  icon?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  wide?: boolean
  /** Evita cerrar con Escape o clic afuera mientras hay una operación en curso. */
  locked?: boolean
}

/** Diálogo modal nativo (`<dialog>`), accesible y con foco atrapado por el navegador. */
export function Dialog({ open, onClose, title, icon, children, actions, wide = false, locked = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const handleCancel = (event: Event) => {
      event.preventDefault()
      if (!locked) onClose()
    }
    const handleClick = (event: MouseEvent) => {
      if (locked) return
      if (event.target === element) onClose()
    }
    element.addEventListener('cancel', handleCancel)
    element.addEventListener('click', handleClick)
    return () => {
      element.removeEventListener('cancel', handleCancel)
      element.removeEventListener('click', handleClick)
    }
  }, [onClose, locked])

  return (
    <dialog ref={ref} className={['dialog', wide ? 'dialog--wide' : ''].join(' ')} aria-labelledby={titleId}>
      <div className="dialog__body">
        <div className="dialog__head">
          {icon}
          <div className="dialog__title" id={titleId}>
            {title}
          </div>
        </div>
        {children}
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </dialog>
  )
}
