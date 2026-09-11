import type { PlanAction } from './command-center.ts';
import type { League } from './types.ts';

export type ActionDecisionStatus = 'acknowledged' | 'dismissed';
export type ActionDecision = {
  fingerprint: string;
  status: ActionDecisionStatus;
  updatedAt: number;
};
export type ActionDecisions = Record<string, ActionDecision>;

// A change detector, not a security token. Ignore volatile scores and refresh times.
export function actionFingerprint(value: unknown) {
  const text = JSON.stringify(value) ?? 'null';
  let hash = BigInt('0xcbf29ce484222325');
  for (let i = 0; i < text.length; i++)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(text.charCodeAt(i))) * BigInt('0x100000001b3'),
    );
  return hash.toString(16).padStart(16, '0');
}

export function actionDecisionKey(action: PlanAction, league: League) {
  return `${league.season}:${league.week}:${action.id}`;
}

export function actionDecisionStatus(
  action: PlanAction,
  league: League,
  decisions: ActionDecisions,
): ActionDecisionStatus | null {
  const saved = decisions[actionDecisionKey(action, league)];
  return saved?.fingerprint === action.fingerprint ? saved.status : null;
}
