import type {
  ActionDecisions,
  ActionDecisionStatus,
} from '../fantasy/action-decisions.ts';

export type ActionDecisionUpdate = {
  key: string;
  fingerprint: string;
  status: ActionDecisionStatus | null;
  revision: number;
};

export function parseActionDecisionUpdate(
  value: Record<string, unknown>,
): ActionDecisionUpdate {
  if (
    typeof value.key !== 'string' ||
    !/^\d{4}:(?:[1-9]|1[0-8]):[^\r\n]{1,280}$/.test(value.key) ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{16}$/.test(value.fingerprint) ||
    !['acknowledged', 'dismissed', null].includes(
      value.status as string | null,
    ) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error('Invalid action decision.');
  return {
    key: value.key,
    fingerprint: value.fingerprint,
    status: value.status as ActionDecisionStatus | null,
    revision: value.revision,
  };
}

export function updateActionDecisions(
  existing: ActionDecisions,
  update: ActionDecisionUpdate,
  now: number,
): ActionDecisions {
  const next = { ...existing };
  if (update.status === null) delete next[update.key];
  else
    next[update.key] = {
      fingerprint: update.fingerprint,
      status: update.status,
      updatedAt: now,
    };
  return Object.fromEntries(
    Object.entries(next)
      .sort(
        ([a, one], [b, two]) =>
          two.updatedAt - one.updatedAt || a.localeCompare(b),
      )
      .slice(0, 256),
  );
}
