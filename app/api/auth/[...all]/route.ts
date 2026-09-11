import { getAuth } from '@/lib/accounts/auth';
export async function GET(request: Request) {
  const response = await getAuth().handler(request);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export async function POST(request: Request) {
  const response = await getAuth().handler(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
