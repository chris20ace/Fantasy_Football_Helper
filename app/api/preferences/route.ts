import { getChatGPTUser } from '#dashboard-auth';
import { getPreferences, putPreferences } from '@/lib/fantasy/server';
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  return Response.json(await getPreferences(user.userId), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host)
    return Response.json({ error: 'Origin mismatch.' }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 40000) throw new Error();
    const value = JSON.parse(text);
    if (
      !value ||
      typeof value.notes !== 'object' ||
      typeof value.reviewed !== 'object' ||
      Object.values(value.notes).some(
        (v) => typeof v !== 'string' || v.length > 1500,
      ) ||
      Object.values(value.reviewed).some((v) => typeof v !== 'boolean')
    )
      throw new Error();
    if (!Number.isSafeInteger(value.revision) || value.revision < 0)
      throw new Error();
    const revision = await putPreferences(
      user.userId,
      { notes: value.notes, reviewed: value.reviewed },
      value.revision,
    );
    if (revision === null)
      return Response.json(
        {
          error:
            'Another device saved changes. Copy your draft, then reload this page before saving.',
        },
        { status: 409 },
      );
    return Response.json({ saved: true, revision });
  } catch {
    return Response.json(
      {
        error:
          'Could not save these notes. Keep each note under 1,500 characters.',
      },
      { status: 400 },
    );
  }
}
