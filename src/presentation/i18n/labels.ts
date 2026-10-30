import type { CrewRole } from '@/domain/model/crew'
import type { CatalogGroupKind, InventoryUnit } from '@/domain/model/inventory'
import type { Weekday } from '@/domain/model/shift'
import type { AccountRole } from '@/domain/model/user'
import type {
  EmailError,
  InventoryTextError,
  NameError,
  PasswordError,
  PhoneError,
  PlateError,
} from '@/domain/validation'

export const roleLabel: Record<CrewRole, string> = {
  LEAD_TECHNICIAN: 'Técnico líder',
  AUXILIARY_TECHNICIAN: 'Técnico auxiliar',
  BOOM_OPERATOR: 'Operador de brazo articulado',
}

export const accountRoleLabel: Record<AccountRole, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
}

export const kindLabel: Record<CatalogGroupKind, string> = {
  TOOL: 'Herramienta',
  CONSUMABLE: 'Consumible',
}

export const unitLabel: Record<InventoryUnit, string> = {
  METERS: 'Metros',
  UNITS: 'Unidades',
}

export const unitShortLabel: Record<InventoryUnit, string> = {
  METERS: 'm',
  UNITS: 'ud',
}

export const weekdayShort: Record<Weekday, string> = {
  MONDAY: 'lun',
  TUESDAY: 'mar',
  WEDNESDAY: 'mié',
  THURSDAY: 'jue',
  FRIDAY: 'vie',
  SATURDAY: 'sáb',
  SUNDAY: 'dom',
}

export const weekdayChip: Record<Weekday, string> = {
  MONDAY: 'Lun',
  TUESDAY: 'Mar',
  WEDNESDAY: 'Mié',
  THURSDAY: 'Jue',
  FRIDAY: 'Vie',
  SATURDAY: 'Sáb',
  SUNDAY: 'Dom',
}

export const nameErrorText: Record<NameError, string> = {
  REQUIRED: 'Ingresa el nombre completo',
  INVALID_CHARACTERS: 'Usa solo letras, espacios, guiones o apóstrofos',
  INCOMPLETE: 'Incluye al menos un nombre y un apellido',
  DUPLICATED_IN_CREW: 'Esta persona ya está en otro rol de la cuadrilla',
}

export const phoneErrorText: Record<PhoneError, string> = {
  REQUIRED: 'Ingresa el celular corporativo',
  INVALID_LENGTH: 'Debe tener 10 dígitos',
  INVALID_PREFIX: 'Un celular en Colombia inicia con 3',
  ALREADY_ASSIGNED: 'Este celular ya está asignado a otra cuadrilla',
}

export const plateErrorText: Record<PlateError, string> = {
  REQUIRED: 'Ingresa la placa del vehículo',
  INVALID_FORMAT: 'Formato inválido. Ej.: ABC 123 o ABC 12D',
  ALREADY_ASSIGNED: 'Esta placa ya está registrada',
  OVERLAP: 'Esta placa se cruza más de una hora con otra cuadrilla',
}

export const inventoryErrorText = (error: InventoryTextError, what: 'item' | 'group'): string => {
  switch (error) {
    case 'REQUIRED':
      return what === 'item' ? 'Ingresa el nombre del ítem' : 'Ingresa el nombre del grupo'
    case 'TOO_SHORT':
      return 'Usa al menos 2 caracteres'
    case 'DUPLICATE':
      return what === 'item' ? 'Este ítem ya existe en ese grupo' : 'Ya existe un grupo con ese nombre'
  }
}

export const emailErrorText: Record<EmailError, string> = {
  REQUIRED: 'Ingresa el correo',
  INVALID: 'El correo no es válido',
  DUPLICATED: 'Este correo ya está registrado',
}

export const passwordErrorText: Record<PasswordError, string> = {
  REQUIRED: 'Ingresa una contraseña',
  TOO_SHORT: 'Mínimo 6 caracteres',
}

export function plural(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`
}

/** "2026-10-14T21:00:00Z" -> "14/10/2026, 16:00" en la zona del navegador. */
export function formatDateTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
