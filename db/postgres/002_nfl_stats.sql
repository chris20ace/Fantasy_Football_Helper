-- Shared public football evidence. Never put account sessions, ownership or league-scored points here.
create table if not exists sunday_desk.nfl_player_week (
  provider text not null check (provider in ('espn','sleeper')),
  player_id text not null,
  season integer not null check (season between 2000 and 2100),
  week integer not null check (week between 1 and 18),
  season_type text not null default 'regular' check (season_type = 'regular'),
  event_id text,
  historical_team text,
  player_name text not null,
  position text not null,
  played boolean,
  native_stats jsonb not null check (jsonb_typeof(native_stats) = 'object'),
  source_url text not null,
  parser_version integer not null default 1,
  fetched_at timestamptz not null default now(),
  primary key(provider,player_id,season,season_type,week)
);
create index if not exists nfl_player_week_window on sunday_desk.nfl_player_week(provider,season,week);
create table if not exists sunday_desk.nfl_stat_coverage (
  provider text not null check (provider in ('espn','sleeper')),
  season integer not null,
  resource text not null,
  row_count integer not null check(row_count >= 0),
  synced_at timestamptz not null default now(),
  primary key(provider,season,resource)
);
create table if not exists sunday_desk.nfl_depth_snapshot (
  provider text not null default 'espn' check (provider = 'espn'),
  team text not null,
  season integer not null,
  snapshot jsonb not null,
  checked_at timestamptz not null,
  primary key(provider,team,season)
);
create table if not exists sunday_desk.nfl_game (
  event_id text primary key,
  season integer not null,
  week integer not null check(week between 1 and 18),
  kickoff timestamptz not null,
  completed boolean not null,
  home_team_id text not null,
  away_team_id text not null,
  home_team text not null,
  away_team text not null,
  home_score numeric,
  away_score numeric,
  source_url text not null,
  fetched_at timestamptz not null default now()
);
