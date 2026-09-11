create table if not exists sunday_desk.workspace (
 user_id text primary key references sunday_desk."user"(id) on delete cascade,
 revision text not null, connections text not null
);
create table if not exists sunday_desk.preferences (
 user_id text primary key references sunday_desk."user"(id) on delete cascade,
 value jsonb not null, revision integer not null check(revision>0)
);
create table if not exists sunday_desk.cache (
 key text primary key, owner_id text references sunday_desk."user"(id) on delete cascade,
 value text not null, updated bigint not null, expires_at timestamptz not null
);
create index if not exists cache_owner_idx on sunday_desk.cache(owner_id);
create index if not exists cache_expiry_idx on sunday_desk.cache(expires_at);
create table if not exists sunday_desk.connection_limits (
 user_id text primary key references sunday_desk."user"(id) on delete cascade,
 window_start timestamptz not null, count integer not null
);
create table if not exists sunday_desk.owner_invite (
 token_hash text primary key, payload text not null, expires_at timestamptz not null
);
