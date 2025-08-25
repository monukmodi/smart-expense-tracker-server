import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' ? true : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

let cachedTransporter;

export function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!SMTP_USER || !SMTP_PASS) {
    // eslint-disable-next-line no-console
    console.warn('[mailer] SMTP_USER/SMTP_PASS not set. Emails will be logged but not sent.');
    cachedTransporter = null;
    return null;
  }
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cachedTransporter;
}

export async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const message = { from: MAIL_FROM, to, subject, text: text || undefined, html: html || undefined };

  if (!transporter) {
    // Dev fallback: log email contents
    // eslint-disable-next-line no-console
    console.log('[mailer:dev] would send email:', JSON.stringify(message, null, 2));
    return { mocked: true };
  }
  return transporter.sendMail(message);
}

export function buildVerificationEmail({ name, code }) {
  const subject = 'Your verification code';
  const html = `<p>Hi ${name || ''},</p>
<p>Your verification code is:</p>
<h2 style="letter-spacing:4px;">${code}</h2>
<p>This code will expire in 15 minutes.</p>`;
  const text = `Hi ${name || ''},\nYour verification code is: ${code}\nThis code will expire in 15 minutes.`;
  return { subject, html, text };
}
