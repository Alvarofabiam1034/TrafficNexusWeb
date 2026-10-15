import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/application/ContainerContext'

import { routes } from './routes'

export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  if (!session) {
    return <Navigate to={routes.login} replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
