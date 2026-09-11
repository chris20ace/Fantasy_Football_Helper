import { requireChatGPTUser } from './chatgpt-auth';
import FantasyDashboard from '@/components/dashboard';
export default async function Home() {
  await requireChatGPTUser('/');
  return <FantasyDashboard />;
}
