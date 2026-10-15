import { Cog, HardHat, Wrench } from 'lucide-react'

import type { CrewRole } from '@/domain/model/crew'

export const roleIcon: Record<CrewRole, typeof HardHat> = {
  LEAD_TECHNICIAN: HardHat,
  AUXILIARY_TECHNICIAN: Wrench,
  BOOM_OPERATOR: Cog,
}
