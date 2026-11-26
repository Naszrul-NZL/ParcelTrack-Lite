import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';

export const runtime = 'nodejs';
export const GET = createUserAdminHandlers().list;
