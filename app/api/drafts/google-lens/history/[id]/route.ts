import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_LENS_SERVICE_URL = "http://127.0.0.1:3400";

const toServiceUrl = () => {
  const configured = String(
    process.env.GOOGLE_LENS_SERVICE_URL || process.env.GOOGLE_REVERSE_IMAGE_SERVICE_URL || ""
  ).trim();
  const base = configured || DEFAULT_LENS_SERVICE_URL;
  return base.replace(/\/+$/, "");
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const id = String(params.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing history id." }, { status: 400 });
  }

  const response = await fetch(`${toServiceUrl()}/api/google-lens/history/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
  });
  const rawText = await response.text();
  const parsed = safeJsonParse(rawText);

  if (!response.ok) {
    const error =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error?: unknown }).error || "")
        : "Google Lens history lookup failed.";
    return NextResponse.json({ error: error || "Google Lens history lookup failed.", details: parsed }, { status: response.status });
  }

  if (parsed && typeof parsed === "object") {
    return NextResponse.json(parsed);
  }

  return NextResponse.json({});
}
