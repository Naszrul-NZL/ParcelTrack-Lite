import { Badge } from '@/components/ui/badge';
import type { ParcelStatus } from '@/shared/constants';
import { PARCEL_PRESENTATION } from '@/shared/parcel-presentation';

export function ParcelStatusBadge({ status }: { status: ParcelStatus }) {
  const variant = status === 'FAILED' ? 'destructive' : status === 'DELIVERED' ? 'delivered' : status === 'REGISTERED' ? 'registered' : 'active';
  return <Badge variant={variant} data-status={status}>{PARCEL_PRESENTATION[status].label}</Badge>;
}
