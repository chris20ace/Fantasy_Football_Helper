import type { GameStatus } from './points.ts';
type Event = {
  id?: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  status?: { type?: { name?: string; state?: string; completed?: boolean } };
  competitions?: {
    id?: string;
    competitors?: { homeAway?: string; team?: { id?: string } }[];
  }[];
};
type Board = {
  season?: { year?: number; type?: number };
  week?: { number?: number };
  events?: Event[];
};
export function gameStatuses(
  board: Board,
  season: number,
  week: number,
): Record<string, { status: GameStatus; home: string; away: string }> {
  if (
    board.season?.year !== season ||
    board.season.type !== 2 ||
    board.week?.number !== week ||
    !Array.isArray(board.events)
  )
    return {};
  const result: Record<
    string,
    { status: GameStatus; home: string; away: string }
  > = {};
  const seen = new Set<string>();
  for (const event of board.events) {
    if (
      !event.id ||
      !/^\d+$/.test(event.id) ||
      event.season?.year !== season ||
      event.season.type !== 2 ||
      event.week?.number !== week
    )
      continue;
    if (seen.has(event.id)) {
      delete result[event.id];
      continue;
    }
    seen.add(event.id);
    const competition =
      event.competitions?.length === 1 ? event.competitions[0] : null;
    const competitors = competition?.competitors;
    const home = competitors?.find((c) => c.homeAway === 'home')?.team?.id;
    const away = competitors?.find((c) => c.homeAway === 'away')?.team?.id;
    if (
      competition?.id !== event.id ||
      competitors?.length !== 2 ||
      !home ||
      !away ||
      home === away
    )
      continue;
    const type = event.status?.type,
      name = type?.name ?? '';
    const status: GameStatus = /CANCEL/.test(name)
      ? 'canceled'
      : /POSTPON/.test(name)
        ? 'postponed'
        : type?.state === 'in'
          ? 'live'
          : /DELAY|SUSPEND/.test(name)
            ? 'delayed'
            : type?.completed === true &&
                type.state === 'post' &&
                /FINAL|FULL_TIME/.test(name)
              ? 'final'
              : type?.state === 'pre' && name === 'STATUS_SCHEDULED'
                ? 'scheduled'
                : 'unknown';
    result[event.id] = { status, home, away };
  }
  return result;
}
