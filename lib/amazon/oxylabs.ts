import crypto from "node:crypto";

export type OxylabsAuth = {
  username: string;
  password: string;
};

export type OxylabsQueryBase = {
  source: string;
  domain?: string;
  parse?: boolean;
  render?: "html";
  geo_location?: string;
  context?: Record<string, unknown>;
};

export type OxylabsQuery =
  | (OxylabsQueryBase & { query: string })
  | (OxylabsQueryBase & { url: string })
  | (OxylabsQueryBase & { category_id: string });

export type OxylabsResult = {
  content: unknown;
  status_code?: number;
  url?: string;
};

export type OxylabsResponse = {
  results?: OxylabsResult[];
  error?: { message?: string } | string;
};

const DEFAULT_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";

const getEnvAuth = (): OxylabsAuth | null => {
  const username = process.env.OXYLABS_USERNAME?.trim() ?? "";
  const password = process.env.OXYLABS_PASSWORD?.trim() ?? "";
  if (!username || !password) return null;
  return { username, password };
};

const basicAuthHeader = (auth: OxylabsAuth) => {
  const token = Buffer.from(`${auth.username}:${auth.password}`).toString(
    "base64"
  );
  return `Basic ${token}`;
};

const asErrorMessage = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const msg = (value as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
};

export class OxylabsError extends Error {
  public readonly code: string;
  public readonly detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "OxylabsError";
    this.code = code;
    this.detail = detail;
  }
}

export const oxylabsEnabled = () => Boolean(getEnvAuth());

export async function oxylabsQuery<TContent = unknown>(
  query: OxylabsQuery,
  opts: { endpoint?: string; auth?: OxylabsAuth } = {}
) {
  const endpoint = opts.endpoint ?? process.env.OXYLABS_ENDPOINT ?? DEFAULT_ENDPOINT;
  const auth = opts.auth ?? getEnvAuth();
  if (!auth) {
    throw new OxylabsError(
      "missing_credentials",
      "Missing OXYLABS_USERNAME / OXYLABS_PASSWORD."
    );
  }

  const requestId = crypto.randomBytes(12).toString("hex");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(auth),
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
    body: JSON.stringify(query),
  });

  let payload: OxylabsResponse | null = null;
  try {
    payload = (await res.json()) as OxylabsResponse;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      asErrorMessage(payload?.error) ||
      asErrorMessage(payload) ||
      `Oxylabs HTTP ${res.status}`;
    throw new OxylabsError("http_error", msg, {
      status: res.status,
      requestId,
      payload,
    });
  }

  const results = payload?.results ?? [];
  const first = results[0];
  if (!first) {
    throw new OxylabsError("empty_results", "Oxylabs returned no results.", {
      requestId,
      payload,
    });
  }

  return {
    requestId,
    result: first,
    content: first.content as TContent,
    payload,
  };
}

