import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const DEV_MAIL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dev-mail');

let transporter = null;
const isSmtpConfigured = () => Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);

// Reserved / non-deliverable domains used by demo and test data. Real email is never sent to these.
const RESERVED_DOMAIN = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net|test)|example|test|invalid|localhost|local)$/i;
export const isUndeliverableAddress = (to) => RESERVED_DOMAIN.test(String(to).trim());

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
};

/**
 * Sends an email via SMTP when configured.
 * DEVELOPMENT FALLBACK: when SMTP_* variables are not set (and not in production) the email is
 * written to server/dev-mail/*.html and summarised in the console instead of being sent.
 * Returns { status: 'sent' | 'logged_dev' }.
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  // Automated tests never send real email, even when SMTP is configured in .env.
  if (env.isTest) return { status: 'logged_dev' };
  // Demo / test addresses (e.g. *@example.test) are never sent real email — saved to dev-mail instead.
  if (isSmtpConfigured() && !isUndeliverableAddress(to)) {
    await getTransporter().sendMail({ from: env.smtp.from, to, subject, html, text });
    return { status: 'sent' };
  }

  if (env.isProduction && !isUndeliverableAddress(to)) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
  }

  {
    await fs.mkdir(DEV_MAIL_DIR, { recursive: true });
    const file = path.join(DEV_MAIL_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${to.replace(/[^a-z0-9]/gi, '_')}.html`);
    await fs.writeFile(file, html, 'utf8');
    console.info(`[email:dev-fallback] Not sent (${isUndeliverableAddress(to) ? 'test address' : 'SMTP not configured'}). "${subject}" to ${to} saved to ${file}`);
  }
  return { status: 'logged_dev' };
};
