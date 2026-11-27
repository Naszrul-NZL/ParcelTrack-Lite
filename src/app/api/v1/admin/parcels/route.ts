import { createDeliveryAdminHandlers } from '@/server/modules/delivery/admin-handlers';

export const runtime = 'nodejs';
export const GET = createDeliveryAdminHandlers().list;
