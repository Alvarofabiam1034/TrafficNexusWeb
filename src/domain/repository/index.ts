import type { Crew, CrewRole } from '../model/crew'
import type {
  KitAssignment,
  StockMovement,
  ToolCheck,
  Vehicle,
  VehicleKit,
  KitLine,
} from '../model/fleet'
import type { CatalogGroupKind, InventoryGroup, InventoryItem } from '../model/inventory'
import type { MapVersion, MapVersionSummary, StoredMap } from '../model/map'
import type { CrewShift } from '../model/shift'
import type { AccountRole, AppUser, Project, ProjectMember, Session } from '../model/user'
import type { EvidencePhoto, EvidenceStatus } from '../model/evidence'
import type {
  ParsedWorkOrderDraft,
  WorkOrder,
  WorkOrderCreateDraft,
  WorkOrderState,
  WorkOrderUpdateDraft,
} from '../model/workOrder'

/**
 * Puertos del dominio. La interfaz habla con estas abstracciones;
 * la infraestructura las implementa contra el backend en Go.
 */

export interface SessionRepository {
  login(email: string, password: string): Promise<Session>
  restore(): Session | null
  switchProject(projectId: string): void
  logout(): void
}

export interface ProjectRepository {
  list(): Promise<Project[]>
  create(name: string): Promise<Project>
  rename(projectId: string, name: string): Promise<Project>
  members(projectId: string, crewRole?: CrewRole): Promise<ProjectMember[]>
  addMember(projectId: string, userId: string): Promise<void>
  removeMember(projectId: string, userId: string): Promise<void>
}

export interface UserDraft {
  readonly email: string
  readonly password: string
  readonly fullName: string
  readonly accountRole: AccountRole
  readonly crewRole: CrewRole | null
}

export interface UserPatch {
  readonly email?: string
  /** Vacía o ausente conserva la contraseña. */
  readonly password?: string
  readonly fullName?: string
  readonly accountRole?: AccountRole
  readonly crewRole?: CrewRole | null
}

export interface UserRepository {
  list(crewRole?: CrewRole): Promise<AppUser[]>
  get(userId: string): Promise<AppUser>
  create(draft: UserDraft): Promise<AppUser>
  update(userId: string, patch: UserPatch): Promise<AppUser>
  remove(userId: string): Promise<void>
}

export interface CrewDraft {
  readonly leadUserId: string
  readonly auxiliaryUserId: string
  readonly boomUserId: string
  readonly corporatePhone: string
  readonly vehicleId: string
}

export type ShiftDraft = Omit<CrewShift, 'id'>

export interface CrewRepository {
  list(projectId: string): Promise<Crew[]>
  get(projectId: string, crewId: string): Promise<Crew>
  create(projectId: string, draft: CrewDraft): Promise<Crew>
  update(projectId: string, crewId: string, draft: CrewDraft): Promise<Crew>
  remove(projectId: string, crewId: string): Promise<void>
  createShift(projectId: string, crewId: string, draft: ShiftDraft): Promise<CrewShift>
  updateShift(projectId: string, crewId: string, shiftId: string, draft: ShiftDraft): Promise<CrewShift>
  removeShift(projectId: string, crewId: string, shiftId: string): Promise<void>
}

export interface FleetRepository {
  vehicles(projectId: string): Promise<Vehicle[]>
  vehicle(projectId: string, vehicleId: string): Promise<Vehicle>
  createVehicle(projectId: string, plate: string): Promise<Vehicle>
  renameVehicle(projectId: string, vehicleId: string, plate: string): Promise<Vehicle>
  removeVehicle(projectId: string, vehicleId: string): Promise<void>
  kits(projectId: string, vehicleId: string): Promise<VehicleKit[]>
  assignKit(projectId: string, vehicleId: string, groupId: string): Promise<VehicleKit>
  removeKit(projectId: string, vehicleId: string, kitId: string): Promise<void>
  reassignKit(projectId: string, kitId: string, vehicleId: string): Promise<VehicleKit>
  adjustLine(projectId: string, lineId: string, quantity: number): Promise<KitLine>
  consume(projectId: string, lineId: string, quantity: number): Promise<KitLine>
  check(projectId: string, lineId: string): Promise<ToolCheck>
  movements(projectId: string, vehicleId: string): Promise<StockMovement[]>
  toolChecks(projectId: string, vehicleId: string): Promise<ToolCheck[]>
  vehicleAssignments(projectId: string, vehicleId: string): Promise<KitAssignment[]>
  groupAssignments(projectId: string, groupId: string): Promise<KitAssignment[]>
}

export interface InventoryRepository {
  groups(projectId: string): Promise<InventoryGroup[]>
  createItem(
    projectId: string,
    name: string,
    groupName: string,
    kind: CatalogGroupKind | null,
  ): Promise<InventoryItem>
  renameItem(projectId: string, itemId: string, name: string): Promise<InventoryItem>
  moveItem(projectId: string, itemId: string, delta: -1 | 1): Promise<void>
  removeItem(projectId: string, itemId: string): Promise<void>
  updateGroup(
    projectId: string,
    groupId: string,
    patch: { name?: string; kind?: CatalogGroupKind },
  ): Promise<InventoryGroup>
  moveGroup(projectId: string, groupId: string, delta: -1 | 1): Promise<void>
  removeGroup(projectId: string, groupId: string): Promise<void>
}

export interface MapRepository {
  latest(projectId: string): Promise<MapVersion | null>
  import(projectId: string, map: StoredMap): Promise<MapVersion>
  versions(projectId: string): Promise<MapVersionSummary[]>
  version(projectId: string, versionId: string): Promise<MapVersion>
}

/** Preferencias que viven en el navegador, no en el servidor. */
export interface LayerPreferences {
  readonly pointsVisible: boolean
  readonly linesVisible: boolean
}

export interface PreferencesRepository {
  layers(): LayerPreferences
  saveLayers(prefs: LayerPreferences): void
}

/** Órdenes de trabajo (OT). Parse + borrador + asignación. */
export interface WorkOrderRepository {
  parse(projectId: string, rawMessage: string): Promise<ParsedWorkOrderDraft>
  list(projectId: string, state?: WorkOrderState): Promise<WorkOrder[]>
  get(projectId: string, workOrderId: string): Promise<WorkOrder>
  create(projectId: string, draft: WorkOrderCreateDraft): Promise<WorkOrder>
  update(projectId: string, workOrderId: string, draft: WorkOrderUpdateDraft): Promise<WorkOrder>
  assign(projectId: string, workOrderId: string, crewId: string): Promise<WorkOrder>
}

/** Evidencias fotográficas de una OT (lectura + nota; upload es Android). */
export interface EvidenceRepository {
  listByWorkOrder(
    projectId: string,
    workOrderId: string,
    status?: EvidenceStatus,
  ): Promise<EvidencePhoto[]>
  get(projectId: string, evidenceId: string): Promise<EvidencePhoto>
  updateCaption(projectId: string, evidenceId: string, caption: string): Promise<EvidencePhoto>
}
