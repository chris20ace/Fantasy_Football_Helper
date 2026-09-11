import { checkOrigin, bodyJSON, privateHeaders } from '@/lib/accounts/request';
import { getChatGPTUser } from '#dashboard-auth';
import { getPreferences, putPreferences } from '@/lib/fantasy/server';
import {
  parseActionDecisionUpdate,
  updateActionDecisions,
} from '@/lib/accounts/preferences';
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in required.' },
      { status: 401, headers: privateHeaders },
    );
  const preferences = await getPreferences(user.userId);
  return Response.json(
    { ...preferences, actionDecisions: preferences.actionDecisions ?? {} },
    {
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  try {
    checkOrigin(request);
    const value = await bodyJSON(request, 40000);
    if (
      !value ||
      !value.notes ||
      Array.isArray(value.notes) ||
      typeof value.notes !== 'object' ||
      !value.reviewed ||
      Array.isArray(value.reviewed) ||
      typeof value.reviewed !== 'object' ||
      Object.values(value.notes).some(
        (v) => typeof v !== 'string' || v.length > 1500,
      ) ||
      Object.values(value.reviewed).some((v) => typeof v !== 'boolean')
    )
      throw new Error();
    if (
      !Number.isSafeInteger(value.revision) ||
      typeof value.revision !== 'number' ||
      value.revision < 0
    )
      throw new Error();
    const current = await getPreferences(user.userId);
    const revision =
      current.revision !== value.revision
        ? null
        : await putPreferences(
            user.userId,
            {
              notes: value.notes,
              reviewed: value.reviewed,
              actionDecisions: current.actionDecisions ?? {},
            },
            value.revision,
          );
    if (revision === null)
      return Response.json(
        {
          error:
            'Another device saved changes. Copy your draft, then reload this page before saving.',
        },
        { status: 409, headers: privateHeaders },
      );
    return Response.json(
      { saved: true, revision },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      {
        error:
          'Could not save these notes. Keep each note under 1,500 characters.',
      },
      { status: 400, headers: privateHeaders },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in required.' },
      { status: 401, headers: privateHeaders },
    );
  try {
    checkOrigin(request);
    const update = parseActionDecisionUpdate(await bodyJSON(request, 4096));
    const current = await getPreferences(user.userId);
    const actionDecisions = updateActionDecisions(
      current.actionDecisions ?? {},
      update,
      Date.now(),
    );
    const revision =
      current.revision !== update.revision
        ? null
        : await putPreferences(
            user.userId,
            {
              notes: current.notes,
              reviewed: current.reviewed,
              actionDecisions,
            },
            update.revision,
          );
    if (revision === null)
      return Response.json(
        {
          error:
            'Another device saved changes. Refresh before updating this action.',
        },
        { status: 409, headers: privateHeaders },
      );
    return Response.json(
      { saved: true, revision, actionDecisions },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: 'Could not update this action. Please try again.' },
      { status: 400, headers: privateHeaders },
    );
  }
}
