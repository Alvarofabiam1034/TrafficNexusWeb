export const routes = {
  login: '/login',
  crews: '/cuadrillas',
  crewNew: '/cuadrillas/nueva',
  crewEdit: (crewId: string) => `/cuadrillas/${encodeURIComponent(crewId)}/editar`,
  crewSchedule: (crewId: string) => `/cuadrillas/${encodeURIComponent(crewId)}/horario`,
  week: '/cuadrillas/semana',
  vehicles: '/vehiculos',
  vehicle: (vehicleId: string) => `/vehiculos/${encodeURIComponent(vehicleId)}`,
  inventory: '/inventario',
  externals: '/externos',
  admin: '/admin',
} as const
