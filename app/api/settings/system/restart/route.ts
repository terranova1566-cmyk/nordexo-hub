import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type RestartRequest = {
  service?: "meilisearch" | "supabase";
};

type ServiceStatus = {
  id: "meilisearch";
  status: "healthy" | "down" | "unknown";
  detail?: string | null;
  checkedAt: string;
};

const MEILI_BIN = "/srv/meilisearch";
const MEILI_DATA = "/srv/meili-data";

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const checkMeilisearch = async (): Promise<ServiceStatus> => {
  const checkedAt = new Date().toISOString();
  const host = process.env.MEILI_HOST?.replace(/\/$/, "");

  if (!host) {
    return {
      id: "meilisearch",
      status: "unknown",
      detail: "MEILI_HOST is not set.",
      checkedAt,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(`${host}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        id: "meilisearch",
        status: "down",
        detail: `HTTP ${response.status}`,
        checkedAt,
      };
    }
    const payload = await response.json().catch(() => null);
    if (payload?.status === "available") {
      return {
        id: "meilisearch",
        status: "healthy",
        detail: null,
        checkedAt,
      };
    }
    return {
      id: "meilisearch",
      status: "down",
      detail: payload?.status ? `status: ${payload.status}` : "Health check failed.",
      checkedAt,
    };
  } catch (err) {
    const error = err as Error;
    return {
      id: "meilisearch",
      status: "down",
      detail: error?.name === "AbortError" ? "Timeout." : error?.message,
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const restartMeilisearch = async (): Promise<ServiceStatus> => {
  const host = process.env.MEILI_HOST?.replace(/\/$/, "");
  if (!host) {
    return {
      id: "meilisearch",
      status: "unknown",
      detail: "MEILI_HOST is not set.",
      checkedAt: new Date().toISOString(),
    };
  }

  let url: URL;
  try {
    url = new URL(host);
  } catch {
    return {
      id: "meilisearch",
      status: "unknown",
      detail: "Invalid MEILI_HOST URL.",
      checkedAt: new Date().toISOString(),
    };
  }

  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    return {
      id: "meilisearch",
      status: "unknown",
      detail: "Remote Meilisearch host; restart disabled.",
      checkedAt: new Date().toISOString(),
    };
  }

  if (!fs.existsSync(MEILI_BIN)) {
    return {
      id: "meilisearch",
      status: "down",
      detail: "Meilisearch binary not found.",
      checkedAt: new Date().toISOString(),
    };
  }

  if (!fs.existsSync(MEILI_DATA)) {
    return {
      id: "meilisearch",
      status: "down",
      detail: "Meilisearch data directory missing.",
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    execSync(`pkill -f "${MEILI_BIN}"`, { stdio: "ignore" });
  } catch {
    // ignore if no process is running
  }

  const httpAddr = `${url.hostname}:${url.port || "7700"}`;
  const logPath = path.join(MEILI_DATA, "meilisearch.log");
  const out = fs.openSync(logPath, "a");
  const err = fs.openSync(logPath, "a");
  const env = { ...process.env };

  const child = spawn(
    MEILI_BIN,
    ["--db-path", MEILI_DATA, "--http-addr", httpAddr],
    {
      detached: true,
      stdio: ["ignore", out, err],
      env,
    }
  );
  child.unref();

  let status = await checkMeilisearch();
  if (status.status !== "healthy") {
    await delay(500);
    status = await checkMeilisearch();
  }
  return status;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json(
      { error: settingsError.message },
      { status: 500 }
    );
  }

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as RestartRequest;
  const service = payload?.service ?? null;

  if (service !== "meilisearch") {
    return NextResponse.json(
      { error: "Unsupported service." },
      { status: 400 }
    );
  }

  const status = await restartMeilisearch();
  const ok = status.status === "healthy";

  return NextResponse.json({
    ok,
    service: status,
  });
}
