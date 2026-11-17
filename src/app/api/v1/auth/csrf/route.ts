import { apiHandler } from '@/server/core/handler';
import { authService } from '@/server/modules/auth/service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET = apiHandler(request => authService().csrf(request));
