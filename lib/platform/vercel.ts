import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
export const setting = (key: string) => process.env[key];
function storageEnvironment() {
  const environment = process.env.VERCEL_ENV ?? 'development';
  if (!['production', 'preview', 'development'].includes(environment))
    throw new Error('Unknown storage environment.');
  return environment;
}
type Stored = { value: string; updated: number };
const pathFor = (kind: string, key: string) =>
  'sunday-desk/' +
  storageEnvironment() +
  '/' +
  kind +
  '/' +
  encodeURIComponent(key) +
  '.json';
async function read(path: string) {
  const blob = await get(path, { access: 'private', useCache: false });
  if (!blob) return null;
  if (blob.statusCode !== 200) throw new Error('Storage returned no content.');
  const value = (await new Response(blob.stream).json()) as Stored;
  return { ...value, etag: blob.blob.etag };
}
export async function readCache(key: string) {
  return read(pathFor('cache', key));
}
export async function saveCache(key: string, value: unknown) {
  await put(
    pathFor('cache', key),
    JSON.stringify({ value: JSON.stringify(value), updated: Date.now() }),
    {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    },
  );
}
export async function getPreferences(user: string) {
  const row = await read(pathFor('preferences', user));
  return row
    ? { ...JSON.parse(row.value), revision: row.updated }
    : { notes: {}, reviewed: {}, revision: 0 };
}
export async function putPreferences(
  user: string,
  value: unknown,
  revision: number,
) {
  const path = pathFor('preferences', user);
  const current = await read(path);
  if ((current?.updated ?? 0) !== revision) return null;
  const next = revision + 1;
  try {
    await put(
      path,
      JSON.stringify({ value: JSON.stringify(value), updated: next }),
      {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: !!current,
        ...(current ? { ifMatch: current.etag } : {}),
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      },
    );
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return null;
    // Concurrent first creation must never overwrite another device's notes.
    if (!current && (await read(path))) return null;
    throw error;
  }
  return next;
}
