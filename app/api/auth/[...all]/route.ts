import { getAuth } from '@/lib/accounts/auth';
export async function GET(request: Request) {
  const response = await getAuth().handler(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export async function POST(request: Request) {
  return getAuth().handler(request);
}
