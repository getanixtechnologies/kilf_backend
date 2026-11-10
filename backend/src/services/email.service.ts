import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email. Never throws: returns whether it went out so callers can
 * tell the admin to share credentials another way.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to: input.to, subject: input.subject }, 'SMTP not configured; email not sent');
    return false;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, ...input });
    return true;
  } catch (err) {
    logger.error({ err, to: input.to, subject: input.subject }, 'Failed to send email');
    return false;
  }
}

export function adminLoginUrl(): string {
  return env.ADMIN_LOGIN_URL ?? `${env.ADMIN_URL.replace(/\/+$/, '')}/login`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function sendCheckerCredentials(input: { name: string; email: string; password: string }) {
  const url = adminLoginUrl();
  const text = [
    `Hi ${input.name},`,
    '',
    'You have been added as a ticket checker for the Kollam International Literature Festival.',
    '',
    `Login page: ${url}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    '',
    'You will be asked to choose a new password the first time you sign in.',
  ].join('\n');
  const html = `
<div style="font-family:Arial,sans-serif;color:#0b1220;max-width:520px">
  <p>Hi ${escapeHtml(input.name)},</p>
  <p>You have been added as a ticket checker for the Kollam International Literature Festival.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0">Email</td><td><b>${escapeHtml(input.email)}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0">Temporary password</td><td><code style="font-size:15px">${escapeHtml(input.password)}</code></td></tr>
  </table>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0b3fd1;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Sign in</a></p>
  <p>You will be asked to choose a new password the first time you sign in.</p>
</div>`;
  return sendMail({ to: input.email, subject: 'Your KILF ticket checker login', text, html });
}
