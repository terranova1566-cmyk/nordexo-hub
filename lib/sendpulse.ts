import { promises as fs } from "fs";
import path from "path";

const API_BASE = "https://api.sendpulse.com";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

const toRecord = (value: unknown) =>
  (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

type SendpulseTemplate = {
  id: string;
  name: string;
};

type SendpulseSender = {
  email: string;
  name?: string | null;
  status?: string | null;
};

type SendEmailPayload = {
  subject: string;
  senderEmail: string;
  senderName?: string | null;
  recipients: { email: string; name?: string | null }[];
  templateId: string;
  variables: Record<string, string>;
};

type SendRenderedEmailPayload = {
  subject: string;
  senderEmail: string;
  senderName?: string | null;
  recipients: { email: string; name?: string | null }[];
  html: string;
  text?: string | null;
  bcc?: { email: string; name?: string | null }[];
};

function getCredentials() {
  const clientId =
    process.env.SENDPULSE_CLIENT_ID || process.env.SENDPULSE_ID || "";
  const clientSecret =
    process.env.SENDPULSE_CLIENT_SECRET || process.env.SENDPULSE_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error("Missing SendPulse client credentials.");
  }
  return { clientId, clientSecret };
}

async function fetchToken() {
  const { clientId, clientSecret } = getCredentials();
  const response = await fetch(`${API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Unable to fetch SendPulse token.");
  }
  const data = await response.json();
  const expiresIn = Number(data?.expires_in ?? 0);
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
  };
  return tokenCache.token;
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  return fetchToken();
}

async function sendpulseRequest<T>(
  pathName: string,
  init?: RequestInit,
  retry = true
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${pathName}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401 && retry) {
    tokenCache = null;
    return sendpulseRequest(pathName, init, false);
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "SendPulse request failed.");
  }
  return (await response.json()) as T;
}

export async function listTemplates(): Promise<SendpulseTemplate[]> {
  const data = await sendpulseRequest<unknown>("/templates");
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => {
      const row = toRecord(item);
      const owner = String(row.owner ?? "").toLowerCase();
      return owner === "you";
    })
    .map((item) => {
      const row = toRecord(item);
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? row.subject ?? ""),
      };
    })
    .filter((item) => item.id && item.name);
}

export async function listSenders(): Promise<SendpulseSender[]> {
  const data = await sendpulseRequest<unknown>("/senders");
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const row = toRecord(item);
      return {
        email: String(row.email ?? ""),
        name: row.name ? String(row.name) : null,
        status: row.status ? String(row.status) : null,
      };
    })
    .filter((item) => item.email);
}

export async function sendTemplateEmail(payload: SendEmailPayload) {
  const body = {
    email: JSON.stringify({
      subject: payload.subject,
      from: {
        name: payload.senderName || payload.senderEmail,
        email: payload.senderEmail,
      },
      to: payload.recipients,
      template: {
        id: payload.templateId,
        variables: payload.variables,
      },
    }),
  };

  return sendpulseRequest("/smtp/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendRenderedEmail(payload: SendRenderedEmailPayload) {
  const emailPayload: Record<string, unknown> = {
    subject: payload.subject,
    from: {
      name: payload.senderName || payload.senderEmail,
      email: payload.senderEmail,
    },
    to: payload.recipients,
    html: Buffer.from(String(payload.html ?? ""), "utf8").toString("base64"),
  };

  const plainText = String(payload.text ?? "").trim();
  if (plainText) {
    emailPayload.text = plainText;
  }

  const bcc = Array.isArray(payload.bcc)
    ? payload.bcc
        .map((entry) => ({
          email: String(entry?.email ?? "").trim(),
          name: entry?.name ? String(entry.name).trim() : undefined,
        }))
        .filter((entry) => entry.email)
    : [];
  if (bcc.length > 0) {
    emailPayload.bcc = bcc;
  }

  return sendpulseRequest("/smtp/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: JSON.stringify(emailPayload) }),
  });
}

export async function appendSendLog(entry: Record<string, unknown>) {
  const logDir = "/srv/partner-product-explorer/exports";
  const filePath = path.join(logDir, "sendpulse-email-log.jsonl");
  try {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    return;
  }
}
