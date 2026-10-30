import type { Crew, CrewMember } from '@/domain/model/crew'
import { isCrewRole } from '@/domain/model/crew'
import type {
  KitAssignment,
  KitLine,
  StockMovement,
  ToolCheck,
  Vehicle,
  VehicleKit,
} from '@/domain/model/fleet'
import type { InventoryGroup, InventoryItem } from '@/domain/model/inventory'
import { isCatalogKind, isInventoryUnit } from '@/domain/model/inventory'
import type { MapLine, MapPlace, MapVersion, MapVersionSummary, StoredMap } from '@/domain/model/map'
import type { CrewShift, Weekday } from '@/domain/model/shift'
import { isWeekday } from '@/domain/model/shift'
import type { AppUser, Project, ProjectMember } from '@/domain/model/user'
import { isAccountRole } from '@/domain/model/user'
import type { EvidencePhoto } from '@/domain/model/evidence'
import { isEvidenceStatus } from '@/domain/model/evidence'
import type {
  ParsedWorkOrderDraft,
  WorkOrder,
  WorkOrderItem,
  WorkOrderItemInput,
  WorkOrderPlace,
} from '@/domain/model/workOrder'
import { isWorkOrderState } from '@/domain/model/workOrder'
import type { ShiftDraft } from '@/domain/repository'
import { parseIso, toIso } from '@/domain/schedule/civilDate'

import type {
  AssignmentDto,
  CheckDto,
  CrewDto,
  InventoryGroupDto,
  InventoryItemDto,
  KitDto,
  LineDto,
  MapImportDto,
  MapVersionDto,
  MemberDto,
  MovementDto,
  ParsedWorkOrderDraftDto,
  PersonDto,
  ProjectDto,
  ShiftDto,
  ShiftRequestDto,
  UserDto,
  VehicleDto,
  EvidencePhotoDto,
  WorkOrderDto,
  WorkOrderItemDto,
  WorkOrderPlaceDto,
} from './dto'

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const int = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function requireId(value: unknown, what: string): string {
  const id = text(value)
  if (!id) throw new Error(`El servidor devolvió ${what} sin id`)
  return id
}

export function toUser(dto: UserDto): AppUser {
  return {
    id: requireId(dto.id, 'un usuario'),
    email: text(dto.email),
    fullName: text(dto.fullName),
    accountRole: isAccountRole(dto.accountRole) ? dto.accountRole : 'OPERATOR',
    crewRole: isCrewRole(dto.crewRole) ? dto.crewRole : null,
  }
}

export function toProject(dto: ProjectDto): Project {
  return { id: requireId(dto.id, 'un proyecto'), name: text(dto.name) }
}

export function toMember(dto: MemberDto): ProjectMember {
  return {
    userId: requireId(dto.userId, 'un miembro'),
    fullName: text(dto.fullName),
    email: text(dto.email),
    accountRole: isAccountRole(dto.accountRole) ? dto.accountRole : 'OPERATOR',
    crewRole: isCrewRole(dto.crewRole) ? dto.crewRole : null,
    crewId: text(dto.crewId) || null,
  }
}

function toCrewMember(dto: PersonDto | undefined): CrewMember {
  return { fullName: text(dto?.fullName), userId: text(dto?.id) }
}

export function toShift(dto: ShiftDto): CrewShift | null {
  const id = text(dto.id)
  if (!id) return null
  const date = dto.shiftDate ? parseIso(dto.shiftDate) : null
  const weekdays = new Set<Weekday>((dto.weekdays ?? []).filter(isWeekday))
  if (date === null && weekdays.size === 0) return null
  return {
    id,
    startMinute: int(dto.startMinute),
    endMinute: int(dto.endMinute),
    weekdays: date === null ? weekdays : new Set(),
    date,
    holiday: Boolean(dto.holiday) && date !== null,
  }
}

export function toShiftRequest(draft: ShiftDraft): ShiftRequestDto {
  return {
    startMinute: draft.startMinute,
    endMinute: draft.endMinute,
    weekdays: draft.date === null ? [...draft.weekdays] : [],
    shiftDate: draft.date === null ? null : toIso(draft.date),
    holiday: draft.date !== null && draft.holiday,
  }
}

export function toCrew(dto: CrewDto): Crew {
  return {
    id: requireId(dto.id, 'una cuadrilla'),
    leadTechnician: toCrewMember(dto.lead),
    auxiliaryTechnician: toCrewMember(dto.auxiliary),
    boomOperator: toCrewMember(dto.boom),
    corporatePhone: text(dto.corporatePhone),
    vehicleId: text(dto.vehicleId),
    vehiclePlate: text(dto.plate),
    shifts: (dto.shifts ?? []).map(toShift).filter((shift): shift is CrewShift => shift !== null),
  }
}

export function toLine(dto: LineDto): KitLine {
  return {
    id: requireId(dto.id, 'una línea'),
    itemId: text(dto.itemId),
    itemName: text(dto.itemName),
    unit: isInventoryUnit(dto.unit) ? dto.unit : 'UNITS',
    quantity: int(dto.quantity),
    brand: text(dto.brand),
    serial: text(dto.serial),
  }
}

export function toInventoryItem(dto: InventoryItemDto): InventoryItem {
  return {
    id: requireId(dto.id, 'un ítem'),
    name: text(dto.name),
    unit: isInventoryUnit(dto.unit) ? dto.unit : 'UNITS',
    sortIndex: int(dto.sortIndex),
  }
}

export function toKit(dto: KitDto): VehicleKit {
  return {
    id: requireId(dto.id, 'una caja'),
    groupId: text(dto.groupId),
    groupName: text(dto.groupName),
    kind: isCatalogKind(dto.kind) ? dto.kind : null,
    lines: (dto.lines ?? []).map(toLine),
  }
}

export function toVehicle(dto: VehicleDto): Vehicle {
  return {
    id: requireId(dto.id, 'un vehículo'),
    plate: text(dto.plate),
    kits: (dto.kits ?? []).map(toKit),
  }
}

export function toMovement(dto: MovementDto): StockMovement {
  return {
    id: requireId(dto.id, 'un movimiento'),
    kitLineId: text(dto.kitLineId),
    itemId: text(dto.itemId),
    itemName: text(dto.itemName),
    groupName: text(dto.groupName),
    plate: text(dto.plate),
    kind: text(dto.kind),
    previousQuantity: int(dto.previousQuantity),
    newQuantity: int(dto.newQuantity),
    actorName: text(dto.actorName),
    createdAt: text(dto.createdAt),
  }
}

export function toCheck(dto: CheckDto): ToolCheck {
  return {
    id: requireId(dto.id, 'un chequeo'),
    kitLineId: text(dto.kitLineId),
    itemId: text(dto.itemId),
    itemName: text(dto.itemName),
    groupName: text(dto.groupName),
    plate: text(dto.plate),
    actorName: text(dto.actorName),
    createdAt: text(dto.createdAt),
  }
}

export function toAssignment(dto: AssignmentDto): KitAssignment {
  return {
    id: requireId(dto.id, 'una asignación'),
    groupId: text(dto.groupId),
    groupName: text(dto.groupName),
    vehicleId: text(dto.vehicleId),
    plate: text(dto.plate),
    kitId: text(dto.kitId),
    assignedAt: text(dto.assignedAt),
    unassignedAt: text(dto.unassignedAt) || null,
    assignedByName: text(dto.assignedByName),
    unassignedByName: text(dto.unassignedByName),
    lines: (dto.lines ?? []).map((line) => ({
      itemId: text(line.itemId),
      itemName: text(line.itemName),
      quantity: int(line.quantity),
    })),
  }
}

export function toInventoryGroup(dto: InventoryGroupDto): InventoryGroup {
  const items: InventoryItem[] = (dto.items ?? [])
    .filter((item) => text(item.id))
    .map((item) => toInventoryItem(item))
    .sort((a, b) => a.sortIndex - b.sortIndex)
  return {
    id: requireId(dto.id, 'un grupo'),
    name: text(dto.name),
    kind: isCatalogKind(dto.kind) ? dto.kind : null,
    sortIndex: int(dto.sortIndex),
    items,
  }
}

export function toMapVersionSummary(dto: MapVersionDto): MapVersionSummary {
  return {
    id: requireId(dto.id, 'una versión del mapa'),
    versionNumber: int(dto.versionNumber),
    createdAt: text(dto.createdAt),
    createdByName: text(dto.createdByName),
  }
}

export function toMapVersion(dto: MapVersionDto): MapVersion {
  const places: MapPlace[] = (dto.places ?? []).map((place, index) => ({
    id: text(place.id) || `place-${index}`,
    name: text(place.name),
    description: text(place.description),
    documentation: text(place.documentation),
    latitude: num(place.latitude),
    longitude: num(place.longitude),
  }))
  const lines: MapLine[] = (dto.lines ?? []).map((line, index) => ({
    id: text(line.id) || `line-${index}`,
    name: text(line.name),
    colorArgb: int(line.colorArgb),
    width: num(line.width),
    points: (line.points ?? []).map((point) => ({
      latitude: num(point.latitude),
      longitude: num(point.longitude),
    })),
  }))
  return { ...toMapVersionSummary(dto), places, lines }
}

export function toMapImport(map: StoredMap): MapImportDto {
  return {
    places: map.places.map((place) => ({
      name: place.name,
      description: place.description,
      documentation: place.documentation,
      latitude: place.latitude,
      longitude: place.longitude,
    })),
    lines: map.lines.map((line) => ({
      name: line.name,
      colorArgb: line.colorArgb,
      width: line.width,
      points: line.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    })),
  }
}

function toWorkOrderItem(dto: WorkOrderItemDto, index: number): WorkOrderItem {
  return {
    id: text(dto.id),
    externalId: text(dto.externalId),
    priority: text(dto.priority),
    address: text(dto.address),
    equipment: text(dto.equipment),
    maintenance: text(dto.maintenance),
    position: int(dto.position) || index,
  }
}

function toWorkOrderPlace(dto: WorkOrderPlaceDto | null | undefined): WorkOrderPlace | null {
  if (!dto) return null
  const id = text(dto.id)
  if (!id) return null
  return {
    id,
    name: text(dto.name),
    latitude: num(dto.latitude),
    longitude: num(dto.longitude),
    documentation: text(dto.documentation),
  }
}

export function toWorkOrder(dto: WorkOrderDto): WorkOrder {
  const state = isWorkOrderState(dto.state) ? dto.state : 'DRAFT'
  return {
    id: requireId(dto.id, 'una orden de trabajo'),
    externalNumber: text(dto.externalNumber),
    statusReported: text(dto.statusReported),
    rawMessage: text(dto.rawMessage),
    parsedNotes: text(dto.parsedNotes),
    adminNotes: text(dto.adminNotes),
    state,
    crewId: dto.crewId ? text(dto.crewId) : null,
    assignedAt: dto.assignedAt ? text(dto.assignedAt) : null,
    assignedBy: dto.assignedBy ? text(dto.assignedBy) : null,
    assignedByName: text(dto.assignedByName),
    createdAt: text(dto.createdAt),
    updatedAt: text(dto.updatedAt),
    createdBy: dto.createdBy ? text(dto.createdBy) : null,
    createdByName: text(dto.createdByName),
    place: toWorkOrderPlace(dto.place),
    items: (dto.items ?? []).map(toWorkOrderItem),
  }
}

export function toParsedWorkOrderDraft(dto: ParsedWorkOrderDraftDto): ParsedWorkOrderDraft {
  return {
    externalNumber: text(dto.externalNumber),
    statusReported: text(dto.statusReported),
    parsedNotes: text(dto.parsedNotes),
    items: (dto.items ?? []).map(toWorkOrderItem),
  }
}

export function toWorkOrderItemRequest(item: WorkOrderItemInput) {
  return {
    externalId: item.externalId,
    priority: item.priority,
    address: item.address,
    equipment: item.equipment,
    maintenance: item.maintenance,
  }
}

export function toEvidencePhoto(dto: EvidencePhotoDto): EvidencePhoto {
  return {
    id: requireId(dto.id, 'una evidencia'),
    photoCode: text(dto.photoCode),
    status: isEvidenceStatus(dto.status) ? dto.status : 'READY',
    capturedAt: text(dto.capturedAt),
    serverReceivedAt: text(dto.serverReceivedAt),
    addressText: text(dto.addressText),
    externalNumber: text(dto.externalNumber),
    directionText: text(dto.directionText),
    caption: text(dto.caption),
    createdByName: text(dto.createdByName),
    byteSize: int(dto.byteSize),
    readUrl: text(dto.readUrl),
    readUrlExpiresAt: text(dto.readUrlExpiresAt),
  }
}
