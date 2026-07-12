import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getSetting } from "@/lib/settings";

// Envío de avisos por email (SMTP vía nodemailer). Degradación elegante: si no
// hay SMTP configurado (SMTP_HOST/ALERT_TO), isEmailConfigured() es false y
// notify() no hace nada — la herramienta sigue funcionando sin email. Los
// avisos NUNCA deben romper el flujo principal: cualquier fallo de envío se
// loguea y se traga.
//
// El transporte NO se cachea a nivel de módulo (a diferencia de la versión
// anterior): los ajustes SMTP pueden cambiar en caliente desde Configuración,
// y crear el transporte es barato (no abre conexión hasta sendMail) — cachear
// habría servido credenciales viejas hasta reiniciar el proceso.

export async function isEmailConfigured(): Promise<boolean> {
  const [host, to] = await Promise.all([getSetting("SMTP_HOST"), getSetting("ALERT_TO")]);
  return Boolean(host && to);
}

async function getTransport(): Promise<nodemailer.Transporter | null> {
  const [host, port, user, pass] = await Promise.all([
    getSetting("SMTP_HOST"),
    getSetting("SMTP_PORT"),
    getSetting("SMTP_USER"),
    getSetting("SMTP_PASS"),
  ]);
  if (!host) return null;

  const numericPort = Number(port) || 587;
  const opts: SMTPTransport.Options = {
    host,
    port: numericPort,
    secure: numericPort === 465,
  };
  if (user || pass) {
    opts.auth = { user: user ?? "", pass: pass ?? "" };
  }
  return nodemailer.createTransport(opts);
}

// Envía un email. Devuelve true si se envió, false si no estaba configurado o
// falló (nunca lanza — los avisos son best-effort).
export async function sendEmail(params: {
  subject: string;
  text: string;
}): Promise<boolean> {
  const [to, from, host] = await Promise.all([
    getSetting("ALERT_TO"),
    getSetting("ALERT_FROM"),
    getSetting("SMTP_HOST"),
  ]);
  if (!to) return false;
  const t = await getTransport();
  if (!t) return false;
  try {
    await t.sendMail({
      from: from ?? `SEO Ciro <no-reply@${host}>`,
      to,
      subject: params.subject,
      text: params.text,
    });
    return true;
  } catch (e) {
    console.error("[email] fallo de envío:", e);
    return false;
  }
}
