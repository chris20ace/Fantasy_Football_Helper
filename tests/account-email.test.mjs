import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { recoveryEmailReady, sendAccountEmail } from '../lib/accounts/email.ts';

const keys = [
  'AUTH_EMAIL_PROVIDER',
  'GMAIL_ADDRESS',
  'GMAIL_APP_PASSWORD',
  'RESEND_API_KEY',
  'AUTH_EMAIL_FROM',
  'BETTER_AUTH_URL',
  'VERCEL_ENV',
];
function setup(t) {
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
    mock.restoreAll();
  });
  process.env.AUTH_EMAIL_PROVIDER = 'gmail';
  process.env.GMAIL_ADDRESS = 'sender@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
  process.env.RESEND_API_KEY = 'unused-test-key';
  process.env.AUTH_EMAIL_FROM = 'Old Sender <mail@example.test>';
  process.env.BETTER_AUTH_URL = 'https://app.example.test';
  delete process.env.VERCEL_ENV;
}
test('Gmail sends only as the configured account over verified TLS, with tokens confined to links', async (t) => {
  setup(t);
  let settings,
    message,
    closed = false;
  mock.method(nodemailer, 'createTransport', (options) => {
    settings = options;
    return {
      sendMail: async (mail) => {
        message = mail;
        return { accepted: mail.to, rejected: [] };
      },
      close: () => {
        closed = true;
      },
    };
  });
  assert.equal(recoveryEmailReady(), true);
  await sendAccountEmail(
    'recipient@example.test',
    'reset',
    'synthetic-reset-token-12345',
  );
  assert.equal(settings.host, 'smtp.gmail.com');
  assert.equal(settings.port, 465);
  assert.equal(settings.secure, true);
  assert.equal(settings.tls.rejectUnauthorized, true);
  assert.equal(settings.auth.pass, 'abcdefghijklmnop');
  assert.equal(settings.logger, false);
  assert.equal(settings.debug, false);
  assert.deepEqual(message.from, {
    name: 'Sunday Desk',
    address: 'sender@gmail.com',
  });
  assert.deepEqual(message.to, ['recipient@example.test']);
  assert.ok(!JSON.stringify(message).includes(settings.auth.pass));
  assert.ok(!JSON.stringify(message).includes('Old Sender'));
  const url = new URL(message.text.match(/https?:\/\/\S+/)[0]);
  assert.equal(url.pathname, '/reset-password');
  assert.equal(url.search, '');
  assert.match(url.hash, /token=/);
  assert.equal(closed, true);
});
test('incomplete Gmail configuration never falls back to an existing Resend sender', async (t) => {
  setup(t);
  delete process.env.GMAIL_APP_PASSWORD;
  assert.equal(recoveryEmailReady(), false);
  await assert.rejects(
    sendAccountEmail('recipient@example.test', 'reset', 'token'),
    { message: 'Account email is not configured.' },
  );
  process.env.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
  process.env.GMAIL_ADDRESS = 'sender@example.com';
  assert.equal(recoveryEmailReady(), false);
  process.env.AUTH_EMAIL_PROVIDER = 'misspelled';
  assert.equal(recoveryEmailReady(), false);
});
test('SMTP failures are redacted before reaching authentication logs', async (t) => {
  setup(t);
  let closed = false;
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      throw new Error('SMTP auth details recipient@example.test secret-value');
    },
    close: () => {
      closed = true;
    },
  }));
  await assert.rejects(
    sendAccountEmail(
      'recipient@example.test',
      'verify',
      'synthetic-verification-token',
    ),
    { message: 'Account email could not be delivered.' },
  );
  assert.equal(closed, true);
});
