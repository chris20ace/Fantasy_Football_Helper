import pg from 'pg';
import { rootCertificates } from 'node:tls';
import { supabaseCA } from './supabase-ca.ts';
let pool: pg.Pool | undefined;
export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Account database is not configured.');
  pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, supabaseCA] },
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
    allowExitOnIdle: true,
  });
  pool.on('error', () =>
    console.error('Account database connection interrupted.'),
  );
  return pool;
}
