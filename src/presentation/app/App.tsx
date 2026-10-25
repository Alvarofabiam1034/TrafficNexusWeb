import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ContainerProvider } from '@/application/ContainerContext'
import { createContainer, type AppContainer } from '@/application/container'
import { DomainError } from '@/domain/errors'
import { Loading } from '@/presentation/components/States'
import { ToastProvider } from '@/presentation/components/Toast'
import { LoginPage } from '@/presentation/features/auth/LoginPage'

import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'
import { routes } from './routes'

const CrewListPage = lazy(() => import('@/presentation/features/crews/CrewListPage'))
const CrewFormPage = lazy(() => import('@/presentation/features/crews/CrewFormPage'))
const ShiftEditorPage = lazy(() => import('@/presentation/features/crews/ShiftEditorPage'))
const WeekTimelinePage = lazy(() => import('@/presentation/features/crews/WeekTimelinePage'))
const FleetListPage = lazy(() => import('@/presentation/features/fleet/FleetListPage'))
const VehicleKitPage = lazy(() => import('@/presentation/features/fleet/VehicleKitPage'))
const InventoryPage = lazy(() => import('@/presentation/features/inventory/InventoryPage'))
const ExternalsPage = lazy(() => import('@/presentation/features/externals/ExternalsPage'))
const WorkOrderListPage = lazy(() => import('@/presentation/features/workOrders/WorkOrderListPage'))
const WorkOrderNewPage = lazy(() => import('@/presentation/features/workOrders/WorkOrderNewPage'))
const WorkOrderDetailPage = lazy(() => import('@/presentation/features/workOrders/WorkOrderDetailPage'))
const AdminPage = lazy(() => import('@/presentation/features/admin/AdminPage'))

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          // Un 4xx no se arregla reintentando.
          if (DomainError.is(error) && error.status >= 400 && error.status < 500) return false
          return count < 2
        },
      },
      mutations: { retry: false },
    },
  })
}

/** Evita que el HMR de Vite deje un container viejo sin repos nuevos (p. ej. evidences). */
function useAppContainer(): AppContainer {
  const [container, setContainer] = useState(createContainer)
  if (!container.evidences) {
    const next = createContainer()
    setContainer(next)
    return next
  }
  return container
}

export function App() {
  const container = useAppContainer()
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <ContainerProvider container={container}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path={routes.login} element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route path={routes.crews} element={<CrewListPage />} />
                    <Route path={routes.crewNew} element={<CrewFormPage />} />
                    <Route path="/cuadrillas/semana" element={<WeekTimelinePage />} />
                    <Route path="/cuadrillas/:crewId/editar" element={<CrewFormPage />} />
                    <Route path="/cuadrillas/:crewId/horario" element={<ShiftEditorPage />} />
                    <Route path={routes.vehicles} element={<FleetListPage />} />
                    <Route path="/vehiculos/:vehicleId" element={<VehicleKitPage />} />
                    <Route path={routes.inventory} element={<InventoryPage />} />
                    <Route path={routes.externals} element={<ExternalsPage />} />
                    <Route path={routes.workOrders} element={<WorkOrderListPage />} />
                    <Route path={routes.workOrderNew} element={<WorkOrderNewPage />} />
                    <Route path="/ordenes/:workOrderId" element={<WorkOrderDetailPage />} />
                    <Route path={routes.admin} element={<AdminPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to={routes.crews} replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ContainerProvider>
  )
}
