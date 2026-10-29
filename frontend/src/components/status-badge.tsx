import { Badge } from "shared/components/ui/badge"
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from "../constants/vehicles"
import type { VehicleStatus } from "../lib/api"

export function StatusBadge({ status }: { status: VehicleStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}
