import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
  const key = Buffer.from(
    process.env.CONNECTION_ENCRYPTION_KEY ?? '',
    'base64',
  );
  if (key.length !== 32)
    throw new Error('Connection encryption is not configured.');
  return key;
}
export function seal(value: unknown, owner: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
export function unseal<T>(value: string, owner: string): T {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext)
    throw new Error('Invalid connection record.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8'),
  ) as T;
}
