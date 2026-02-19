import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  defaultFromEmail: string;
  defaultFromName: string;
};

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function getSmtpConfig(): SmtpConfig {
  const host = env("MXROUTE_SMTP_HOST", "SMTP_HOST");
  const port = Number(env("MXROUTE_SMTP_PORT", "SMTP_PORT") || "587");
  const secureRaw = env("MXROUTE_SMTP_SECURE", "SMTP_SECURE").toLowerCase();
  const secure = secureRaw === "1" || secureRaw === "true";
  const user = env("MXROUTE_SMTP_USER", "SMTP_USER");
  const pass = env("MXROUTE_SMTP_PASS", "SMTP_PASS");
  const defaultFromEmail = env(
    "PARTNER_EMAIL_FROM",
    "MXROUTE_FROM_EMAIL",
    "SMTP_FROM_EMAIL",
    "MXROUTE_SMTP_USER",
    "SMTP_USER"
  );
  const defaultFromName = env(
    "PARTNER_EMAIL_FROM_NAME",
    "MXROUTE_FROM_NAME",
    "SMTP_FROM_NAME"
  );

  if (!host || !port || !user || !pass || !defaultFromEmail) {
    throw new Error("Missing SMTP configuration for partner email sender.");
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    defaultFromEmail,
    defaultFromName: defaultFromName || defaultFromEmail,
  };
}

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey = "";

function configKey(config: SmtpConfig) {
  return [
    config.host,
    String(config.port),
    config.secure ? "1" : "0",
    config.user,
    config.defaultFromEmail,
    config.defaultFromName,
  ].join("|");
}

function getTransporter(config: SmtpConfig) {
  const key = configKey(config);
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

export type SenderIdentity = {
  email: string;
  name: string;
};

export function getEnvSmtpConfig(): SmtpConfig | null {
  try {
    return getSmtpConfig();
  } catch {
    return null;
  }
}

export function listConfiguredSenders(): SenderIdentity[] {
  const config = getEnvSmtpConfig();
  if (!config) return [];
  return [
    {
      email: config.defaultFromEmail,
      name: config.defaultFromName,
    },
  ];
}

export async function sendEmailViaSmtp(input: {
  subject: string;
  html: string;
  text: string;
  to: { email: string; name?: string | null }[];
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}, smtpConfig?: SmtpConfig) {
  const config = smtpConfig ?? getSmtpConfig();
  const transporter = getTransporter(config);
  const fromEmail = (input.fromEmail || config.defaultFromEmail).trim();
  const fromName = (input.fromName || config.defaultFromName || fromEmail).trim();

  const result = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: input.to.map((entry) => (entry.name ? `${entry.name} <${entry.email}>` : entry.email)),
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    response: result.response,
  };
}
