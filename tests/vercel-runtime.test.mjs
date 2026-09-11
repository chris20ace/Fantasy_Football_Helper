import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, unseal } from '../lib/accounts/crypto.ts';
import { checkOrigin, bodyJSON } from '../lib/accounts/request.ts';
process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
void test('saved credentials are encrypted and bound to their owner', () => {
  const input = { s2: 'private-session', swid: 'private-owner' };
  const encrypted = seal(input, 'user-a');
  assert.ok(!encrypted.includes('private-session'));
  assert.deepEqual(unseal(encrypted, 'user-a'), input);
  assert.throws(() => unseal(encrypted, 'user-b'));
});
void test('tampered credentials cannot be decrypted', () => {
  const encrypted = seal({ secret: 'value' }, 'user-a');
  const parts = encrypted.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => unseal(parts.join('.'), 'user-a'));
});
void test('mutations require the canonical origin', () => {
  process.env.BETTER_AUTH_URL = 'https://sunday.example';
  assert.throws(() =>
    checkOrigin(
      new Request('https://sunday.example/api/connections', {
        headers: { origin: 'https://attacker.example' },
      }),
    ),
  );
  assert.throws(() =>
    checkOrigin(new Request('https://sunday.example/api/connections')),
  );
  checkOrigin(
    new Request('https://sunday.example/api/connections', {
      headers: { origin: 'https://sunday.example' },
    }),
  );
});
void test('oversized and array form bodies are rejected', async () => {
  await assert.rejects(
    bodyJSON(
      new Request('https://sunday.example/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '[]',
      }),
    ),
  );
  await assert.rejects(
    bodyJSON(
      new Request('https://sunday.example/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x: 'a'.repeat(20000) }),
      }),
    ),
  );
});
