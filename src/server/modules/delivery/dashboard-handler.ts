import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { apiHandler } from '@/server/core/handler';
import { readAdminDashboard } from './dashboard-service';

export function createDashboardHandler(authorize: typeof principalUow = principalUow) {
  return apiHandler(async request => {
    const dashboard = await authorize(request, { roles: ['ADMIN'] }, client => readAdminDashboard(client));
    return Response.json(dashboard);
  });
}
