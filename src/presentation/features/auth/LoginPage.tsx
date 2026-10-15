import { Eye, EyeOff, KeyRound, LogIn, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useContainer, useSession } from '@/application/ContainerContext'
import { DomainError, messageOf } from '@/domain/errors'
import { routes } from '@/presentation/app/routes'
import { Button, IconButton } from '@/presentation/components/Button'
import { TextField } from '@/presentation/components/Field'

import './login.css'

export function LoginPage() {
  const { session: sessionRepo } = useContainer()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to={routes.crews} replace />

  const from = (location.state as { from?: string } | null)?.from ?? routes.crews

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await sessionRepo.login(email, password)
      navigate(from, { replace: true })
    } catch (caught) {
      if (DomainError.is(caught, 'UNAUTHORIZED') || DomainError.is(caught, 'INVALID')) {
        setError('Correo o contraseña incorrectos')
      } else {
        setError(messageOf(caught, 'No se pudo iniciar sesión'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <div className="login__panel">
        <div className="login__logo">
          <img src="/brand/traffic-nexus-dark.png" alt="Traffic Nexus" />
        </div>
        <p className="login__tagline">Gestión inteligente de semaforización</p>
        <div className="signal-marks" aria-hidden>
          <span />
          <span />
          <span />
        </div>

        <form className="login__card card" onSubmit={submit} noValidate>
          <TextField
            label="Correo"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError(null)
            }}
            icon={<Mail />}
            autoFocus
          />
          <TextField
            label="Contraseña"
            type={visible ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError(null)
            }}
            icon={<KeyRound />}
            trailing={
              <IconButton
                size="sm"
                label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
          {error ? (
            <p className="login__error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" icon={<LogIn />} loading={submitting}>
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  )
}
