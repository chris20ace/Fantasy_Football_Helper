import { requireChatGPTUser } from '#dashboard-auth';
import { loadWorkspace } from '#dashboard-runtime';
import { redirect } from 'next/navigation';
import FantasyDashboard from '@/components/dashboard';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  if (!(await loadWorkspace(user.userId)).connections.length)
    redirect('/setup');
  return <FantasyDashboard displayName={user.displayName} />;
}
