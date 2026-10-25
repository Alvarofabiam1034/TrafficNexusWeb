/** Claves de caché. Todas cuelgan del proyecto para que cambiar de proyecto limpie todo. */
export const queryKeys = {
  projects: ['projects'] as const,
  users: ['users'] as const,
  members: (projectId: string) => ['project', projectId, 'members'] as const,
  crews: (projectId: string) => ['project', projectId, 'crews'] as const,
  vehicles: (projectId: string) => ['project', projectId, 'vehicles'] as const,
  vehicle: (projectId: string, vehicleId: string) => ['project', projectId, 'vehicles', vehicleId] as const,
  movements: (projectId: string, vehicleId: string) =>
    ['project', projectId, 'vehicles', vehicleId, 'movements'] as const,
  toolChecks: (projectId: string, vehicleId: string) =>
    ['project', projectId, 'vehicles', vehicleId, 'tool-checks'] as const,
  vehicleAssignments: (projectId: string, vehicleId: string) =>
    ['project', projectId, 'vehicles', vehicleId, 'assignments'] as const,
  inventory: (projectId: string) => ['project', projectId, 'inventory'] as const,
  map: (projectId: string) => ['project', projectId, 'map'] as const,
  mapVersions: (projectId: string) => ['project', projectId, 'map', 'versions'] as const,
  mapVersion: (projectId: string, versionId: string) => ['project', projectId, 'map', 'versions', versionId] as const,
  workOrders: (projectId: string, state?: string) =>
    state
      ? (['project', projectId, 'work-orders', { state }] as const)
      : (['project', projectId, 'work-orders'] as const),
  workOrder: (projectId: string, workOrderId: string) => ['project', projectId, 'work-orders', workOrderId] as const,
  evidences: (projectId: string, workOrderId: string) =>
    ['project', projectId, 'work-orders', workOrderId, 'evidences'] as const,
  evidence: (projectId: string, evidenceId: string) => ['project', projectId, 'evidences', evidenceId] as const,
  project: (projectId: string) => ['project', projectId] as const,
}
