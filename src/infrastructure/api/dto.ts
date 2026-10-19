/**
 * Cuerpos JSON tal como los produce el backend en Go (paquetes `dto` de `internal/controller`).
 * Todo opcional en lectura: el mapper decide qué es obligatorio.
 */

export interface UserDto {
  id?: string
  email?: string
  fullName?: string
  accountRole?: string
  crewRole?: string | null
}

export interface LoginResponseDto {
  token?: string
  user?: UserDto
}

export interface ProjectDto {
  id?: string
  name?: string
  createdAt?: string
  updatedAt?: string
}

export interface MemberDto {
  userId?: string
  fullName?: string
  email?: string
  accountRole?: string
  crewRole?: string | null
  crewId?: string | null
}

export interface PersonDto {
  id?: string
  fullName?: string
  crewRole?: string
}

export interface ShiftDto {
  id?: string
  startMinute?: number
  endMinute?: number
  weekdays?: string[] | null
  shiftDate?: string | null
  holiday?: boolean
}

export interface CrewDto {
  id?: string
  lead?: PersonDto
  auxiliary?: PersonDto
  boom?: PersonDto
  corporatePhone?: string
  vehicleId?: string
  plate?: string
  shifts?: ShiftDto[] | null
}

export interface CrewRequestDto {
  leadUserId: string
  auxiliaryUserId: string
  boomUserId: string
  corporatePhone: string
  vehicleId: string
}

export interface ShiftRequestDto {
  startMinute: number
  endMinute: number
  weekdays: string[]
  shiftDate: string | null
  holiday: boolean
}

export interface LineDto {
  id?: string
  itemId?: string
  itemName?: string
  quantity?: number
}

export interface KitDto {
  id?: string
  groupId?: string
  groupName?: string
  kind?: string
  lines?: LineDto[] | null
}

export interface VehicleDto {
  id?: string
  plate?: string
  kits?: KitDto[] | null
}

export interface MovementDto {
  id?: string
  kitLineId?: string
  itemId?: string
  itemName?: string
  groupName?: string
  plate?: string
  kind?: string
  previousQuantity?: number
  newQuantity?: number
  actorName?: string
  createdAt?: string
}

export interface CheckDto {
  id?: string
  kitLineId?: string
  itemId?: string
  itemName?: string
  groupName?: string
  plate?: string
  actorName?: string
  createdAt?: string
}

export interface AssignmentLineDto {
  itemId?: string
  itemName?: string
  quantity?: number
}

export interface AssignmentDto {
  id?: string
  groupId?: string
  groupName?: string
  vehicleId?: string
  plate?: string
  kitId?: string
  assignedAt?: string
  unassignedAt?: string | null
  assignedByName?: string
  unassignedByName?: string
  lines?: AssignmentLineDto[] | null
}

export interface InventoryItemDto {
  id?: string
  name?: string
  sortIndex?: number
}

export interface InventoryGroupDto {
  id?: string
  name?: string
  kind?: string
  sortIndex?: number
  items?: InventoryItemDto[] | null
}

export interface MapPointDto {
  latitude?: number
  longitude?: number
}

export interface MapPlaceDto {
  id?: string
  name?: string
  description?: string
  documentation?: string
  latitude?: number
  longitude?: number
}

export interface MapLineDto {
  id?: string
  name?: string
  colorArgb?: number
  width?: number
  points?: MapPointDto[] | null
}

export interface MapVersionDto {
  id?: string
  versionNumber?: number
  createdAt?: string
  createdByName?: string
  places?: MapPlaceDto[] | null
  lines?: MapLineDto[] | null
}

export interface MapImportDto {
  places: Array<Omit<MapPlaceDto, 'id'>>
  lines: Array<Omit<MapLineDto, 'id'>>
}

export interface WorkOrderItemDto {
  id?: string
  externalId?: string
  priority?: string
  address?: string
  equipment?: string
  maintenance?: string
  position?: number
}

export interface WorkOrderDto {
  id?: string
  externalNumber?: string
  statusReported?: string
  rawMessage?: string
  parsedNotes?: string
  adminNotes?: string
  state?: string
  crewId?: string | null
  assignedAt?: string | null
  assignedBy?: string | null
  assignedByName?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string | null
  createdByName?: string
  items?: WorkOrderItemDto[] | null
}

export interface ParsedWorkOrderDraftDto {
  externalNumber?: string
  statusReported?: string
  parsedNotes?: string
  items?: WorkOrderItemDto[] | null
}
