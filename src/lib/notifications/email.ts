import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

// Envío de avisos por email (SMTP vía nodemailer). Degradación elegante: si no
// hay SMTP configurado (SMTP_HOST/ALERT_TO), isEmailConfigured() es false y
// notify() no hace nada — la herramienta sigue funcionando sin email. Los
// avisos NUNCA deben romper el flujo principal: cualquier fallo de envío se
// loguea y se traga.

let transport: nodemailer.Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.ALERT_TO);
}

function getTransport(): nodemailer.Transporter | null {
  if (!isEmailConfigured()) return null;
  if (transport) return transport;

  const opts: SMTPTransport.Options = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (Number(process.env.SMTP_PORT) || 587) === 465,
  };
  if (process.env.SMTP_USER || process.env.SMTP_PASS) {
    opts.auth = {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    };
  }
  transport = nodemailer.createTransport(opts);
  return transport;
}

// Envía un email. Devuelve true si se envió, false si no estaba configurado o
// falló (nunca lanza — los avisos son best-effort).
export async function sendEmail(params: {
  subject: string;
  text: string;
}): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  const to = process.env.ALERT_TO!;
  const from = process.env.ALERT_FROM ?? `SEO Ciro <no-reply@${process.env.SMTP_HOST}>`;
  try {
    await t.sendMail({ from, to, subject: params.subject, text: params.text });
    return true;
  } catch (e) {
    console.error("[email] fallo de envío:", e);
    return false;
  }
}
