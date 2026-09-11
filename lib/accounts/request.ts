import { appOrigin } from './origin.ts';
import { InputError } from './errors.ts';
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = appOrigin();
  if (
    !origin ||
    !expected ||
    new URL(origin).origin !== new URL(expected).origin
  )
    throw new InputError('Open this form on Sunday Desk and try again.');
}
export async function bodyJSON(
  request: Request,
  limit = 16000,
): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new InputError('Submit a valid form.');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Submit a valid form.');
  let size = 0,
    text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new InputError('This form is too large.');
    }
    text += decoder.decode(r.value, { stream: true });
  }
  text += decoder.decode();
  const body = JSON.parse(text);
  if (!body || Array.isArray(body) || typeof body !== 'object')
    throw new InputError('Submit a valid form.');
  return body;
}
export const privateHeaders = { 'Cache-Control': 'private, no-store' };
