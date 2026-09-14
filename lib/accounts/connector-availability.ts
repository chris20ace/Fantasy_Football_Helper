import {
  connectorRelease,
  connectorStoreId,
  connectorStoreUrl,
  type ConnectorRelease,
} from './connector-release.ts';

const cacheMs = 5 * 60 * 1000;
const maxResponseBytes = 3 * 1024 * 1024;

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
      (match) => [
        match[1].toLowerCase(),
        (match[2] ?? match[3]).replaceAll('&amp;', '&'),
      ],
    ),
  );
}

// An unpublished store item also returns HTTP 200. Require both a released
// package for this exact ID and a public listing with an installation control.
export function hasReleasedPackage(
  manifest: string,
  id = connectorStoreId,
): boolean {
  const root = manifest.match(
    /^\s*(?:<\?xml[^>]*\?>\s*)?<gupdate\b([^>]*)>([\s\S]*)<\/gupdate>\s*$/,
  );
  if (
    !root ||
    /<!DOCTYPE|<!ENTITY/i.test(manifest) ||
    attributes(root[1]).xmlns !== 'http://www.google.com/update2/response' ||
    attributes(root[1]).protocol !== '2.0'
  )
    return false;
  const app = [...manifest.matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/g)].find(
    (match) => attributes(match[1]).appid === id,
  );
  if (!app || attributes(app[1]).status !== 'ok') return false;
  const updateTag = app[2].match(/<updatecheck\b([^>]*)\/?\s*>/);
  if (!updateTag) return false;
  const update = attributes(updateTag[1]);
  if (
    update.status !== 'ok' ||
    !/^\d+(?:\.\d+){1,3}$/.test(update.version ?? '')
  )
    return false;
  try {
    const download = new URL(update.codebase);
    if (
      download.protocol !== 'https:' ||
      !download.hostname.endsWith('.googleusercontent.com')
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export function isPublicConnector(
  manifest: string,
  listing: string,
  id = connectorStoreId,
): boolean {
  if (!hasReleasedPackage(manifest, id)) return false;
  try {
    const canonical = [...listing.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => attributes(match[0]))
      .find((link) => link.rel === 'canonical');
    if (!canonical?.href) return false;
    const page = new URL(canonical.href);
    if (
      page.origin !== 'https://chromewebstore.google.com' ||
      !page.pathname.startsWith('/detail/') ||
      page.pathname.split('/').at(-1) !== id
    )
      return false;
    return [...listing.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].some(
      (match) => match[1].replace(/<[^>]*>/g, '').trim() === 'Add to Chrome',
    );
  } catch {
    return false;
  }
}

export function releasedConnectorVersion(
  manifest: string,
  id = connectorStoreId,
): string | null {
  if (!hasReleasedPackage(manifest, id)) return null;
  const app = [...manifest.matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/g)].find(
    (m) => attributes(m[1]).appid === id,
  );
  const update = app?.[2].match(/<updatecheck\b([^>]*)\/?\s*>/);
  return update ? attributes(update[1]).version : null;
}

async function readPublic(url: string, listing = false): Promise<string> {
  let response: Response | undefined;
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    response = await fetch(url, {
      headers: { Accept: 'text/html, application/xml, text/xml' },
      signal,
      redirect: listing ? 'manual' : 'error',
      credentials: 'omit',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!listing || !location || redirects === 3)
      throw new Error('Unexpected store redirect');
    const next = new URL(location, url);
    if (
      next.origin !== 'https://chromewebstore.google.com' ||
      next.username ||
      next.password ||
      !next.pathname.startsWith('/detail/') ||
      next.pathname.split('/').at(-1) !== connectorStoreId
    )
      throw new Error('Unexpected store redirect');
    url = next.href;
  }
  if (!response?.ok || !response.body) throw new Error('Store unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0,
    text = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new Error('Store response too large');
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}

let cached: { expires: number; release: ConnectorRelease } | undefined;
let pending: Promise<ConnectorRelease> | undefined;
export async function getConnectorRelease(): Promise<ConnectorRelease> {
  if (cached && cached.expires > Date.now()) return cached.release;
  if (pending) return pending;
  pending = (async () => {
    let release = connectorRelease;
    try {
      const url = new URL('https://clients2.google.com/service/update2/crx');
      url.searchParams.set('response', 'updatecheck');
      url.searchParams.set('prodversion', '149.0.0.0');
      url.searchParams.set('acceptformat', 'crx3');
      url.searchParams.set('x', 'id=' + connectorStoreId + '&v=0.0.0.0&uc');
      const manifest = await readPublic(url.href);
      const version = releasedConnectorVersion(manifest);
      if (version) {
        const listing = await readPublic(connectorStoreUrl + '?hl=en', true);
        if (isPublicConnector(manifest, listing))
          release = {
            version,
            status: 'published',
            storeUrl: connectorStoreUrl,
          };
      }
    } catch {
      // A network error, unknown item or changed markup cannot enable installation.
    }
    cached = { expires: Date.now() + cacheMs, release };
    return release;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
