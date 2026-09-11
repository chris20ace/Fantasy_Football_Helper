import { requireChatGPTUser } from '#dashboard-auth';
import { loadWorkspace } from '#dashboard-runtime';
import { redirect } from 'next/navigation';
import FantasyDashboard from '@/components/dashboard';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  if (
    !(await loadWorkspace(user.userId)).connections.some(
      (c) => c.leagues.length > 0,
    )
  )
    redirect('/setup');
  return (
    <FantasyDashboard
      key={user.userId}
      workspaceId={user.userId}
      displayName={user.displayName}
    />
  );
}
