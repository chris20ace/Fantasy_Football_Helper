import pg from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from '../lib/accounts/auth.ts';
import { getPool } from '../lib/accounts/db.ts';
import { supabaseCA } from '../lib/accounts/supabase-ca.ts';
if (!process.env.DATABASE_ADMIN_URL || !process.env.DATABASE_RUNTIME_PASSWORD)
  throw new Error('Migration administrator credentials are required.');
const admin = new pg.Pool({
  connectionString: process.env.DATABASE_ADMIN_URL,
  ssl: { rejectUnauthorized: true, ca: [...rootCertificates, supabaseCA] },
  options: '-c search_path=sunday_desk',
  max: 1,
});
try {
  await admin.query('create schema if not exists sunday_desk');
  const role = await admin.query(
    "select 1 from pg_roles where rolname='sunday_desk_app'",
  );
  if (!role.rowCount)
    await admin.query(
      'create role sunday_desk_app login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password ' +
        pg.escapeLiteral(process.env.DATABASE_RUNTIME_PASSWORD),
    );
  await admin.query('alter role sunday_desk_app set search_path=sunday_desk');
  await admin.query(
    'revoke all on schema sunday_desk from public, anon, authenticated',
  );
  const migration = await getMigrations({
    ...getAuth().options,
    database: admin,
  });
  if (migration.unsafeChanges.length || migration.schemaProblems.length)
    throw new Error('Auth schema needs manual review.');
  const generated = await migration.compileMigrations();
  if (generated.trim())
    await writeFile(
      new URL('../db/postgres/000_auth_generated.sql', import.meta.url),
      generated,
    );
  await migration.runMigrations();
  await admin.query(
    await readFile(
      new URL('../db/postgres/001_workspace.sql', import.meta.url),
      'utf8',
    ),
  );
  await admin.query('grant usage on schema sunday_desk to sunday_desk_app');
  await admin.query(
    'grant select,insert,update,delete on all tables in schema sunday_desk to sunday_desk_app',
  );
  await admin.query(
    'grant usage,select on all sequences in schema sunday_desk to sunday_desk_app',
  );
  const tables = await admin.query(
    "select tablename from pg_tables where schemaname='sunday_desk'",
  );
  for (const { tablename } of tables.rows) {
    const table = 'sunday_desk.' + pg.escapeIdentifier(tablename);
    await admin.query('alter table ' + table + ' enable row level security');
    const policy = await admin.query(
      "select 1 from pg_policies where schemaname='sunday_desk' and tablename=$1 and policyname='server_only'",
      [tablename],
    );
    if (!policy.rowCount)
      await admin.query(
        'create policy server_only on ' +
          table +
          ' to sunday_desk_app using(true) with check(true)',
      );
  }
  console.log(
    'Created isolated account tables, private workspace storage, and restricted application role.',
  );
} finally {
  await admin.end();
  await getPool().end();
}
