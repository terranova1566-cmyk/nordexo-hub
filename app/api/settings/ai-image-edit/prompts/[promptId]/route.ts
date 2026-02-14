import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TABLE = "ai_image_edit_prompts";

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

type RouteContext = {
  params: Promise<{ promptId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { promptId } = await context.params;
  const id = String(promptId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Prompt ID is required." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .select(
      "prompt_id,name,usage,description,template_text,created_at,updated_at"
    )
    .eq("prompt_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { promptId } = await context.params;
  const id = String(promptId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Prompt ID is required." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof payload.name === "string") {
    const name = payload.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "Name is too long." }, { status: 400 });
    }
    updates.name = name;
  }
  if (typeof payload.usage === "string") {
    updates.usage = payload.usage.trim();
  }
  if (typeof payload.description === "string") {
    updates.description = payload.description.trim();
  }
  if (typeof payload.template_text === "string") {
    updates.template_text = payload.template_text;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .update(updates)
    .eq("prompt_id", id)
    .select(
      "prompt_id,name,usage,description,template_text,created_at,updated_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (Object.prototype.hasOwnProperty.call(updates, "template_text")) {
    const { error: versionsError } = await auth.supabase
      .from("ai_image_edit_prompt_versions")
      .insert([
        { prompt_id: id, template_text: String(data.template_text ?? "") },
      ]);
    if (versionsError) {
      return NextResponse.json({ error: versionsError.message }, { status: 500 });
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { promptId } = await context.params;
  const id = String(promptId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Prompt ID is required." }, { status: 400 });
  }

  const { error: versionsError } = await auth.supabase
    .from("ai_image_edit_prompt_versions")
    .delete()
    .eq("prompt_id", id);
  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  const { error } = await auth.supabase.from(TABLE).delete().eq("prompt_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
