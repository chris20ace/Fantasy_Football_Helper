import { requireChatGPTUser } from '#dashboard-auth';
import { publicConnections } from '@/lib/accounts/storage';
import ConnectionSetup from '@/components/connection-setup';
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams,
    claim = params.claim;
  const user = await requireChatGPTUser(
    '/setup' + (claim ? '?claim=' + encodeURIComponent(claim) : ''),
  );
  return (
    <ConnectionSetup
      name={user.displayName}
      accountId={user.userId}
      initial={await publicConnections(user.userId)}
      claim={claim}
    />
  );
}
