import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { IconButton } from './Button'
import './pageHeader.css'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  backTo?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, backTo, actions }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <header className="page-header">
      {backTo ? (
        <IconButton label="Volver" onClick={() => navigate(backTo)}>
          <ArrowLeft />
        </IconButton>
      ) : null}
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle ? <div className="page-header__subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}
