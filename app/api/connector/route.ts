import { getConnectorRelease } from '@/lib/accounts/connector-availability';

// Contains only public store metadata; no account or session access is required.
export async function GET() {
  return Response.json(await getConnectorRelease(), {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  });
}
