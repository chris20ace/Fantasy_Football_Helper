import { createHash } from 'node:crypto';
import { appOrigin } from './origin.ts';

export function recoveryEmailReady() {
  return !!(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export async function sendAccountEmail(
  to: string,
  kind: 'reset' | 'verify',
  token: string,
) {
  if (!recoveryEmailReady())
    throw new Error('Account email is not configured.');
  const origin = appOrigin();
  if (!origin) throw new Error('Account origin is not configured.');
  // Fragments keep bearer tokens out of page requests and referrer headers.
  const url = new URL(
    kind === 'reset' ? '/reset-password' : '/verify-email',
    origin,
  );
  url.hash = new URLSearchParams({ token }).toString();
  const title =
    kind === 'reset'
      ? 'Reset your Sunday Desk password'
      : 'Confirm your Sunday Desk recovery email';
  const action =
    kind === 'reset' ? 'Choose a new password' : 'Confirm recovery email';
  const detail =
    kind === 'reset'
      ? 'Use this link to choose a new password. Your existing sessions will be signed out after the reset.'
      : 'Confirm this email address so you can recover your Sunday Desk account if you forget your password.';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': createHash('sha256')
        .update(`${kind}:${token}`)
        .digest('hex'),
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [to],
      subject: title,
      text: `${title}\n\n${detail}\n\n${action}: ${url.href}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.\n\nSunday Desk`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#152d4d"><p style="font-size:20px;font-weight:bold">Sunday Desk</p><h1 style="font-size:25px;line-height:1.3">${escape(title)}</h1><p style="font-size:16px;line-height:1.6">${escape(detail)}</p><p style="margin:28px 0"><a href="${escape(url.href)}" style="background:#2459ed;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block">${action}</a></p><p style="font-size:14px;line-height:1.6">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error('Account email could not be delivered.');
}
