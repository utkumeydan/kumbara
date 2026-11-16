import nodemailer from 'nodemailer';

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const FROM = process.env.MAIL_FROM ?? 'Kumbara <no-reply@kumbara.app>';

// SMTP_URL tanımlı değilse (yerel geliştirme) e-posta konsola yazılır
export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`[e-posta] ${to} · ${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, text });
}
