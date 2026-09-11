import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { appOrigin } from './origin.ts';

function gmailSettings() {
  const user = process.env.GMAIL_ADDRESS?.trim().toLowerCase() ?? '';
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') ?? '';
  return /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/.test(user) &&
    /^[a-zA-Z0-9]{16}$/.test(pass)
    ? { user, pass }
    : null;
}

export function recoveryEmailReady() {
  if (process.env.AUTH_EMAIL_PROVIDER === 'gmail') return !!gmailSettings();
  if (
    process.env.AUTH_EMAIL_PROVIDER &&
    process.env.AUTH_EMAIL_PROVIDER !== 'resend'
  )
    return false;
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
  const content = {
    to: [to],
    subject: title,
    text: `${title}\n\n${detail}\n\n${action}: ${url.href}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.\n\nSunday Desk`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#152d4d"><p style="font-size:20px;font-weight:bold">Sunday Desk</p><h1 style="font-size:25px;line-height:1.3">${escape(title)}</h1><p style="font-size:16px;line-height:1.6">${escape(detail)}</p><p style="margin:28px 0"><a href="${escape(url.href)}" style="background:#2459ed;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block">${action}</a></p><p style="font-size:14px;line-height:1.6">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p></div>`,
  };
  if (process.env.AUTH_EMAIL_PROVIDER === 'gmail') {
    const auth = gmailSettings()!;
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        ...content,
        from: { name: 'Sunday Desk', address: auth.user },
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error('Recipient not accepted.');
    } catch {
      // SMTP errors can include addresses and authentication details.
      throw new Error('Account email could not be delivered.');
    } finally {
      transport.close();
    }
    return;
  }
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
      ...content,
    }),
  });
  if (!response.ok) throw new Error('Account email could not be delivered.');
}
