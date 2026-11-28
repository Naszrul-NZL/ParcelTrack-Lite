import { LoginPage } from '@/features/auth/login-page';
export const dynamic='force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ workspace?: string | string[]; notice?: string | string[] }> }) {
  const params = await searchParams;
  const workspace = params.workspace === 'rider' || params.workspace === 'admin' ? params.workspace : 'seller';
  const notice = params.notice === 'registered' || params.notice === 'password-changed' ? params.notice : undefined;
  return <div className="page-width login-page"><LoginPage initialWorkspace={workspace} notice={notice} /></div>;
}
