import type { Player } from './types.ts';

export type GameStatus =
  | 'scheduled'
  | 'live'
  | 'final'
  | 'delayed'
  | 'postponed'
  | 'canceled'
  | 'unknown'
  | 'bye';
const finite = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function isLocked(p: Player, now = Date.now()) {
  return (
    p.gameStatus === 'live' ||
    p.gameStatus === 'final' ||
    p.locked === true ||
    (p.kickoff !== null && p.kickoff <= now)
  );
}

export function playerPoints(
  player: Player | null | undefined,
  now = Date.now(),
) {
  if (!player)
    return { value: null, basis: 'pending', label: 'Empty' } as const;
  if (player.gameStatus === 'final' || player.gameStatus === 'live') {
    const value = finite(player.actual);
    const label = player.gameStatus === 'final' ? 'Final' : 'Live';
    return {
      value,
      basis: 'actual',
      label: value === null ? `${label} · pending` : label,
    } as const;
  }
  if (player.bye || player.gameStatus === 'bye')
    return { value: null, basis: 'pending', label: 'Bye' } as const;
  if (player.gameStatus === 'postponed' || player.gameStatus === 'canceled')
    return {
      value: null,
      basis: 'pending',
      label: player.gameStatus === 'postponed' ? 'Postponed' : 'Canceled',
    } as const;
  if (
    player.gameStatus === 'scheduled' ||
    player.gameStatus === 'delayed' ||
    (player.kickoff !== null && player.kickoff > now)
  )
    return {
      value: player.partial ? null : finite(player.projection),
      basis: 'projection',
      label: 'Proj.',
    } as const;
  // A lock, pregame zero, or elapsed kickoff cannot establish that a game finished.
  return { value: null, basis: 'pending', label: 'Status pending' } as const;
}

export function scoreProgress(players: (Player | null)[], now = Date.now()) {
  const final = players.filter((p) => p?.gameStatus === 'final').length;
  const live = players.filter((p) => p?.gameStatus === 'live').length;
  const upcoming = players.filter(
    (p) => playerPoints(p, now).basis === 'projection',
  ).length;
  return {
    final,
    live,
    upcoming,
    pending: players.length - final - live - upcoming,
    allFinal: players.length > 0 && final === players.length,
  };
}

export function gameLabel(player: Player, now = Date.now()) {
  if (player.gameStatus === 'final') return 'Final';
  if (player.gameStatus === 'live') return 'Game in progress';
  if (player.bye || player.gameStatus === 'bye') return 'Bye week';
  if (player.gameStatus === 'delayed') return 'Game delayed';
  if (player.gameStatus === 'postponed') return 'Game postponed';
  if (player.gameStatus === 'canceled') return 'Game canceled';
  if (
    player.kickoff !== null &&
    (player.kickoff > now || player.gameStatus === 'scheduled')
  )
    return new Date(player.kickoff).toLocaleString([], {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  return 'Game status unconfirmed';
}
