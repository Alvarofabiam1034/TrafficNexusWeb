import { DomainError } from '@/domain/errors'
import type { Crew, CrewRole } from '@/domain/model/crew'
import type {
  KitAssignment,
  KitLine,
  StockMovement,
  ToolCheck,
  Vehicle,
  VehicleKit,
} from '@/domain/model/fleet'
import type { CatalogGroupKind, InventoryGroup, InventoryItem } from '@/domain/model/inventory'
import type { MapVersion, MapVersionSummary, StoredMap } from '@/domain/model/map'
import type { CrewShift } from '@/domain/model/shift'
import type { AppUser, Project, ProjectMember, Session } from '@/domain/model/user'
import type { EvidencePhoto, EvidenceStatus } from '@/domain/model/evidence'
import type {
  ParsedWorkOrderDraft,
  WorkOrder,
  WorkOrderCreateDraft,
  WorkOrderState,
  WorkOrderUpdateDraft,
} from '@/domain/model/workOrder'
import type {
  CrewDraft,
  CrewRepository,
  EvidenceRepository,
  FleetRepository,
  InventoryRepository,
  MapRepository,
  ProjectRepository,
  SessionRepository,
  ShiftDraft,
  UserDraft,
  UserPatch,
  UserRepository,
  WorkOrderRepository,
} from '@/domain/repository'
import { normalizeEmail } from '@/domain/validation/appUserValidator'
import { normalizePlate } from '@/domain/validation/crewValidator'

import type { HttpClient } from '../http/httpClient'
import type { BrowserSessionStore } from '../storage/sessionStorage'
import type {
  AssignmentDto,
  CheckDto,
  CrewDto,
  InventoryGroupDto,
  InventoryItemDto,
  KitDto,
  LineDto,
  LoginResponseDto,
  MapVersionDto,
  MemberDto,
  MovementDto,
  EvidencePhotoDto,
  ParsedWorkOrderDraftDto,
  ProjectDto,
  ShiftDto,
  UserDto,
  VehicleDto,
  WorkOrderDto,
} from './dto'
import {
  toAssignment,
  toCheck,
  toCrew,
  toEvidencePhoto,
  toInventoryGroup,
  toKit,
  toLine,
  toMapImport,
  toMapVersion,
  toMapVersionSummary,
  toMember,
  toMovement,
  toParsedWorkOrderDraft,
  toProject,
  toShift,
  toShiftRequest,
  toUser,
  toVehicle,
  toWorkOrder,
  toWorkOrderItemRequest,
} from './mappers'

const DEFAULT_PROJECT_NAME = 'TrafficNexus'

const projectPath = (projectId: string): string => `/v1/projects/${encodeURIComponent(projectId)}`
const enc = encodeURIComponent

export class ApiSessionRepository implements SessionRepository {
  constructor(
    private readonly http: HttpClient,
    private readonly store: BrowserSessionStore,
    private readonly onChange: (session: Session | null) => void,
  ) {}

  async login(email: string, password: string): Promise<Session> {
    const response = await this.http.post<LoginResponseDto>('/v1/auth/login', {
      email: normalizeEmail(email),
      password,
    })
    const token = response.token
    if (!token || !response.user) throw new DomainError('UNAUTHORIZED', 'El servidor no devolvió la sesión', 401)
    const user = toUser(response.user)

    // El token ya es válido: lo publicamos antes de pedir los proyectos.
    const provisional: Session = { token, user, projectId: '' }
    this.store.write(provisional)
    this.onChange(provisional)

    try {
      const projects = (await this.http.get<ProjectDto[]>('/v1/projects')).map(toProject)
      const remembered = this.store.rememberedProject()
      let chosen = projects.find((project) => project.id === remembered) ?? projects[0]
      if (!chosen && user.accountRole === 'ADMIN') {
        chosen = toProject(await this.http.post<ProjectDto>('/v1/projects', { name: DEFAULT_PROJECT_NAME }))
      }
      if (!chosen) throw new DomainError('FORBIDDEN', 'No perteneces a ningún proyecto', 403)
      const session: Session = { token, user, projectId: chosen.id }
      this.store.write(session)
      this.onChange(session)
      return session
    } catch (error) {
      this.store.clear()
      this.onChange(null)
      throw error
    }
  }

  restore(): Session | null {
    const session = this.store.read()
    return session && session.projectId ? session : null
  }

  switchProject(projectId: string): void {
    const current = this.store.read()
    if (!current) return
    const next = { ...current, projectId }
    this.store.write(next)
    this.onChange(next)
  }

  logout(): void {
    this.store.clear()
    this.onChange(null)
  }
}

export class ApiProjectRepository implements ProjectRepository {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<Project[]> {
    return (await this.http.get<ProjectDto[]>('/v1/projects')).map(toProject)
  }

  async create(name: string): Promise<Project> {
    return toProject(await this.http.post<ProjectDto>('/v1/projects', { name }))
  }

  async rename(projectId: string, name: string): Promise<Project> {
    return toProject(await this.http.put<ProjectDto>(projectPath(projectId), { name }))
  }

  async members(projectId: string, crewRole?: CrewRole): Promise<ProjectMember[]> {
    const dtos = await this.http.get<MemberDto[]>(`${projectPath(projectId)}/members`, { crewRole })
    return dtos.map(toMember)
  }

  async addMember(projectId: string, userId: string): Promise<void> {
    await this.http.post<unknown>(`${projectPath(projectId)}/members`, { userId })
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/members/${enc(userId)}`)
  }
}

export class ApiUserRepository implements UserRepository {
  constructor(private readonly http: HttpClient) {}

  async list(crewRole?: CrewRole): Promise<AppUser[]> {
    return (await this.http.get<UserDto[]>('/v1/users', { crewRole })).map(toUser)
  }

  async get(userId: string): Promise<AppUser> {
    return toUser(await this.http.get<UserDto>(`/v1/users/${enc(userId)}`))
  }

  async create(draft: UserDraft): Promise<AppUser> {
    return toUser(
      await this.http.post<UserDto>('/v1/users', {
        email: normalizeEmail(draft.email),
        password: draft.password,
        fullName: draft.fullName,
        accountRole: draft.accountRole,
        crewRole: draft.crewRole,
      }),
    )
  }

  async update(userId: string, patch: UserPatch): Promise<AppUser> {
    const body: Record<string, unknown> = {}
    if (patch.email !== undefined) body.email = normalizeEmail(patch.email)
    if (patch.fullName !== undefined) body.fullName = patch.fullName
    if (patch.accountRole !== undefined) body.accountRole = patch.accountRole
    if (patch.crewRole !== undefined) body.crewRole = patch.crewRole
    if (patch.password) body.password = patch.password
    return toUser(await this.http.put<UserDto>(`/v1/users/${enc(userId)}`, body))
  }

  async remove(userId: string): Promise<void> {
    await this.http.delete(`/v1/users/${enc(userId)}`)
  }
}

export class ApiCrewRepository implements CrewRepository {
  constructor(private readonly http: HttpClient) {}

  async list(projectId: string): Promise<Crew[]> {
    return (await this.http.get<CrewDto[]>(`${projectPath(projectId)}/crews`)).map(toCrew)
  }

  async get(projectId: string, crewId: string): Promise<Crew> {
    return toCrew(await this.http.get<CrewDto>(`${projectPath(projectId)}/crews/${enc(crewId)}`))
  }

  async create(projectId: string, draft: CrewDraft): Promise<Crew> {
    return toCrew(await this.http.post<CrewDto>(`${projectPath(projectId)}/crews`, draft))
  }

  async update(projectId: string, crewId: string, draft: CrewDraft): Promise<Crew> {
    return toCrew(await this.http.put<CrewDto>(`${projectPath(projectId)}/crews/${enc(crewId)}`, draft))
  }

  async remove(projectId: string, crewId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/crews/${enc(crewId)}`)
  }

  async createShift(projectId: string, crewId: string, draft: ShiftDraft): Promise<CrewShift> {
    const dto = await this.http.post<ShiftDto>(
      `${projectPath(projectId)}/crews/${enc(crewId)}/shifts`,
      toShiftRequest(draft),
    )
    return requireShift(dto)
  }

  async updateShift(projectId: string, crewId: string, shiftId: string, draft: ShiftDraft): Promise<CrewShift> {
    const dto = await this.http.put<ShiftDto>(
      `${projectPath(projectId)}/crews/${enc(crewId)}/shifts/${enc(shiftId)}`,
      toShiftRequest(draft),
    )
    return requireShift(dto)
  }

  async removeShift(projectId: string, crewId: string, shiftId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/crews/${enc(crewId)}/shifts/${enc(shiftId)}`)
  }
}

function requireShift(dto: ShiftDto): CrewShift {
  const shift = toShift(dto)
  if (!shift) throw new DomainError('UNKNOWN', 'El servidor devolvió un turno incompleto')
  return shift
}

export class ApiFleetRepository implements FleetRepository {
  constructor(private readonly http: HttpClient) {}

  async vehicles(projectId: string): Promise<Vehicle[]> {
    const list = (await this.http.get<VehicleDto[]>(`${projectPath(projectId)}/vehicles`)).map(toVehicle)
    // El listado no trae cajas; las pedimos por placa para tener el conteo y las cantidades.
    const kits = await Promise.all(list.map((vehicle) => this.kits(projectId, vehicle.id)))
    return list.map((vehicle, index) => ({ ...vehicle, kits: kits[index] ?? [] }))
  }

  async vehicle(projectId: string, vehicleId: string): Promise<Vehicle> {
    const dto = await this.http.get<VehicleDto>(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}`)
    const vehicle = toVehicle(dto)
    if (vehicle.kits.length > 0 || dto.kits !== undefined) return vehicle
    return { ...vehicle, kits: await this.kits(projectId, vehicleId) }
  }

  async createVehicle(projectId: string, plate: string): Promise<Vehicle> {
    return toVehicle(
      await this.http.post<VehicleDto>(`${projectPath(projectId)}/vehicles`, { plate: normalizePlate(plate) }),
    )
  }

  async renameVehicle(projectId: string, vehicleId: string, plate: string): Promise<Vehicle> {
    return toVehicle(
      await this.http.put<VehicleDto>(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}`, {
        plate: normalizePlate(plate),
      }),
    )
  }

  async removeVehicle(projectId: string, vehicleId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}`)
  }

  async kits(projectId: string, vehicleId: string): Promise<VehicleKit[]> {
    return (await this.http.get<KitDto[]>(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}/kits`)).map(toKit)
  }

  async assignKit(projectId: string, vehicleId: string, groupId: string): Promise<VehicleKit> {
    return toKit(
      await this.http.post<KitDto>(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}/kits`, { groupId }),
    )
  }

  async removeKit(projectId: string, vehicleId: string, kitId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}/kits/${enc(kitId)}`)
  }

  async reassignKit(projectId: string, kitId: string, vehicleId: string): Promise<VehicleKit> {
    return toKit(await this.http.post<KitDto>(`${projectPath(projectId)}/kits/${enc(kitId)}/reassign`, { vehicleId }))
  }

  async adjustLine(projectId: string, lineId: string, quantity: number): Promise<KitLine> {
    return toLine(await this.http.put<LineDto>(`${projectPath(projectId)}/kit-lines/${enc(lineId)}`, { quantity }))
  }

  async consume(projectId: string, lineId: string, quantity: number): Promise<KitLine> {
    return toLine(
      await this.http.post<LineDto>(`${projectPath(projectId)}/kit-lines/${enc(lineId)}/consumptions`, { quantity }),
    )
  }

  async check(projectId: string, lineId: string): Promise<ToolCheck> {
    return toCheck(await this.http.post<CheckDto>(`${projectPath(projectId)}/kit-lines/${enc(lineId)}/checks`, {}))
  }

  async movements(projectId: string, vehicleId: string): Promise<StockMovement[]> {
    const dtos = await this.http.get<MovementDto[]>(
      `${projectPath(projectId)}/vehicles/${enc(vehicleId)}/stock-movements`,
    )
    return dtos.map(toMovement)
  }

  async toolChecks(projectId: string, vehicleId: string): Promise<ToolCheck[]> {
    const dtos = await this.http.get<CheckDto[]>(`${projectPath(projectId)}/vehicles/${enc(vehicleId)}/tool-checks`)
    return dtos.map(toCheck)
  }

  async vehicleAssignments(projectId: string, vehicleId: string): Promise<KitAssignment[]> {
    const dtos = await this.http.get<AssignmentDto[]>(
      `${projectPath(projectId)}/vehicles/${enc(vehicleId)}/assignments`,
    )
    return dtos.map(toAssignment)
  }

  async groupAssignments(projectId: string, groupId: string): Promise<KitAssignment[]> {
    const dtos = await this.http.get<AssignmentDto[]>(`${projectPath(projectId)}/groups/${enc(groupId)}/assignments`)
    return dtos.map(toAssignment)
  }
}

export class ApiInventoryRepository implements InventoryRepository {
  constructor(private readonly http: HttpClient) {}

  async groups(projectId: string): Promise<InventoryGroup[]> {
    const dtos = await this.http.get<InventoryGroupDto[]>(`${projectPath(projectId)}/inventory/groups`)
    return dtos.map(toInventoryGroup).sort((a, b) => a.sortIndex - b.sortIndex)
  }

  async createItem(
    projectId: string,
    name: string,
    groupName: string,
    kind: CatalogGroupKind | null,
  ): Promise<InventoryItem> {
    const dto = await this.http.post<InventoryItemDto>(`${projectPath(projectId)}/inventory/items`, {
      name,
      groupName,
      kind,
    })
    return { id: dto.id ?? '', name: dto.name ?? name, sortIndex: dto.sortIndex ?? 0 }
  }

  async renameItem(projectId: string, itemId: string, name: string): Promise<InventoryItem> {
    const dto = await this.http.put<InventoryItemDto>(`${projectPath(projectId)}/inventory/items/${enc(itemId)}`, {
      name,
    })
    return { id: dto.id ?? itemId, name: dto.name ?? name, sortIndex: dto.sortIndex ?? 0 }
  }

  async moveItem(projectId: string, itemId: string, delta: -1 | 1): Promise<void> {
    await this.http.put<unknown>(`${projectPath(projectId)}/inventory/items/${enc(itemId)}/position`, { delta })
  }

  async removeItem(projectId: string, itemId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/inventory/items/${enc(itemId)}`)
  }

  async updateGroup(
    projectId: string,
    groupId: string,
    patch: { name?: string; kind?: CatalogGroupKind },
  ): Promise<InventoryGroup> {
    return toInventoryGroup(
      await this.http.put<InventoryGroupDto>(`${projectPath(projectId)}/inventory/groups/${enc(groupId)}`, patch),
    )
  }

  async moveGroup(projectId: string, groupId: string, delta: -1 | 1): Promise<void> {
    await this.http.put<unknown>(`${projectPath(projectId)}/inventory/groups/${enc(groupId)}/position`, { delta })
  }

  async removeGroup(projectId: string, groupId: string): Promise<void> {
    await this.http.delete(`${projectPath(projectId)}/inventory/groups/${enc(groupId)}`)
  }
}

export class ApiMapRepository implements MapRepository {
  constructor(private readonly http: HttpClient) {}

  async latest(projectId: string): Promise<MapVersion | null> {
    try {
      return toMapVersion(await this.http.get<MapVersionDto>(`${projectPath(projectId)}/map`))
    } catch (error) {
      if (DomainError.is(error, 'NOT_FOUND')) return null
      throw error
    }
  }

  async import(projectId: string, map: StoredMap): Promise<MapVersion> {
    return toMapVersion(await this.http.post<MapVersionDto>(`${projectPath(projectId)}/map/imports`, toMapImport(map)))
  }

  async versions(projectId: string): Promise<MapVersionSummary[]> {
    const dtos = await this.http.get<MapVersionDto[]>(`${projectPath(projectId)}/map/versions`)
    return dtos.map(toMapVersionSummary)
  }

  async version(projectId: string, versionId: string): Promise<MapVersion> {
    return toMapVersion(await this.http.get<MapVersionDto>(`${projectPath(projectId)}/map/versions/${enc(versionId)}`))
  }
}

export class ApiWorkOrderRepository implements WorkOrderRepository {
  constructor(private readonly http: HttpClient) {}

  async parse(projectId: string, rawMessage: string): Promise<ParsedWorkOrderDraft> {
    return toParsedWorkOrderDraft(
      await this.http.post<ParsedWorkOrderDraftDto>(`${projectPath(projectId)}/work-orders/parse`, { rawMessage }),
    )
  }

  async list(projectId: string, state?: WorkOrderState): Promise<WorkOrder[]> {
    const dtos = await this.http.get<WorkOrderDto[]>(`${projectPath(projectId)}/work-orders`, {
      state,
    })
    return dtos.map(toWorkOrder)
  }

  async get(projectId: string, workOrderId: string): Promise<WorkOrder> {
    return toWorkOrder(
      await this.http.get<WorkOrderDto>(`${projectPath(projectId)}/work-orders/${enc(workOrderId)}`),
    )
  }

  async create(projectId: string, draft: WorkOrderCreateDraft): Promise<WorkOrder> {
    const body: Record<string, unknown> = {
      placeId: draft.placeId,
      rawMessage: draft.rawMessage,
    }
    if (draft.adminNotes !== undefined) body.adminNotes = draft.adminNotes
    if (draft.externalNumber !== undefined) body.externalNumber = draft.externalNumber
    if (draft.statusReported !== undefined) body.statusReported = draft.statusReported
    if (draft.parsedNotes !== undefined) body.parsedNotes = draft.parsedNotes
    if (draft.items !== undefined) body.items = draft.items.map(toWorkOrderItemRequest)
    return toWorkOrder(await this.http.post<WorkOrderDto>(`${projectPath(projectId)}/work-orders`, body))
  }

  async update(projectId: string, workOrderId: string, draft: WorkOrderUpdateDraft): Promise<WorkOrder> {
    const body: Record<string, unknown> = {
      externalNumber: draft.externalNumber,
      statusReported: draft.statusReported,
      parsedNotes: draft.parsedNotes,
      adminNotes: draft.adminNotes,
      items: draft.items.map(toWorkOrderItemRequest),
    }
    if (draft.placeId !== undefined) body.placeId = draft.placeId
    return toWorkOrder(await this.http.put<WorkOrderDto>(`${projectPath(projectId)}/work-orders/${enc(workOrderId)}`, body))
  }

  async assign(projectId: string, workOrderId: string, crewId: string): Promise<WorkOrder> {
    return toWorkOrder(
      await this.http.post<WorkOrderDto>(`${projectPath(projectId)}/work-orders/${enc(workOrderId)}/assignment`, {
        crewId,
      }),
    )
  }
}

export class ApiEvidenceRepository implements EvidenceRepository {
  constructor(private readonly http: HttpClient) {}

  async listByWorkOrder(
    projectId: string,
    workOrderId: string,
    status?: EvidenceStatus,
  ): Promise<EvidencePhoto[]> {
    const dtos = await this.http.get<EvidencePhotoDto[]>(
      `${projectPath(projectId)}/work-orders/${enc(workOrderId)}/evidences`,
      { status },
    )
    return dtos.map(toEvidencePhoto)
  }

  async get(projectId: string, evidenceId: string): Promise<EvidencePhoto> {
    return toEvidencePhoto(
      await this.http.get<EvidencePhotoDto>(`${projectPath(projectId)}/evidences/${enc(evidenceId)}`),
    )
  }

  async updateCaption(projectId: string, evidenceId: string, caption: string): Promise<EvidencePhoto> {
    return toEvidencePhoto(
      await this.http.patch<EvidencePhotoDto>(`${projectPath(projectId)}/evidences/${enc(evidenceId)}`, {
        caption,
      }),
    )
  }
}
