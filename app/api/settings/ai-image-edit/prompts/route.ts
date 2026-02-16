import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TABLE = "ai_image_edit_prompts";
const PROMPT_ID_LENGTH = 8;
const PROMPT_ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generatePromptId(length = PROMPT_ID_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PROMPT_ID_ALPHABET[bytes[i] % PROMPT_ID_ALPHABET.length];
  }
  return out;
}

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
    };
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
      supabase,
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { ok: true as const, supabase };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from(TABLE)
    .select(
      "prompt_id,name,usage,description,address,template_text,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prompts: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const name = String(payload.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const usageRaw = typeof payload.usage === "string" ? payload.usage.trim() : "";
  const usage = usageRaw ? usageRaw : null;
  const descriptionRaw =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const description = descriptionRaw ? descriptionRaw : null;
  const addressRaw =
    typeof payload.address === "string" ? payload.address.trim() : "";
  const address = addressRaw ? addressRaw : null;
  const templateText =
    typeof payload.template_text === "string" ? payload.template_text : "";

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const promptId = generatePromptId();
    const { data, error } = await auth.supabase
      .from(TABLE)
      .insert({
        prompt_id: promptId,
        name,
        usage,
        description,
        address,
        template_text: templateText,
      })
      .select(
        "prompt_id,name,usage,description,address,template_text,created_at,updated_at"
      )
      .single();

    if (!error) {
      // Always create a first version, even if empty, so the UI has a stable "current".
      const { error: versionsError } = await auth.supabase
        .from("ai_image_edit_prompt_versions")
        .insert([
          {
            prompt_id: promptId,
            template_text: String(data?.template_text ?? ""),
          },
        ]);
      if (versionsError) {
        return NextResponse.json({ error: versionsError.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    lastError = error;
    const code = (error as { code?: string | null })?.code ?? null;
    const message = String((error as { message?: string })?.message ?? "");
    const isUniqueViolation =
      code === "23505" || message.toLowerCase().includes("duplicate");
    if (isUniqueViolation) continue;

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { error: (lastError as { message?: string })?.message || "Failed to create prompt." },
    { status: 500 }
  );
}
