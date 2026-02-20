import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  isMissingEmailMacroRegistryTableError,
  normalizeMacroKey,
  validateMacroKey,
} from "@/lib/email-macro-registry";

export const runtime = "nodejs";

const TABLE = "partner_email_macro_registry";

type RouteContext = {
  params: Promise<{ macroKey: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { macroKey: macroKeyParam } = await context.params;
  const macroKey = normalizeMacroKey(macroKeyParam);
  const keyError = validateMacroKey(macroKey);
  if (keyError) {
    return NextResponse.json({ error: keyError }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  };
  if (Object.prototype.hasOwnProperty.call(payload, "label")) {
    updates.label = String(payload.label ?? "").trim() || macroKey;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    updates.description = String(payload.description ?? "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "data_source")) {
    updates.data_source = String(payload.data_source ?? "").trim() || "variables";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "dataSource")) {
    updates.data_source = String(payload.dataSource ?? "").trim() || "variables";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "formatter")) {
    updates.formatter = String(payload.formatter ?? "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "fallback_value")) {
    updates.fallback_value = String(payload.fallback_value ?? "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "fallbackValue")) {
    updates.fallback_value = String(payload.fallbackValue ?? "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_required")) {
    updates.is_required = Boolean(payload.is_required);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "isRequired")) {
    updates.is_required = Boolean(payload.isRequired);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_deprecated")) {
    updates.is_deprecated = Boolean(payload.is_deprecated);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "isDeprecated")) {
    updates.is_deprecated = Boolean(payload.isDeprecated);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    updates.is_active = Boolean(payload.is_active);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "isActive")) {
    updates.is_active = Boolean(payload.isActive);
  }

  const hasUpdates = Object.keys(updates).some((key) => key !== "updated_at" && key !== "updated_by");
  if (!hasUpdates) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .update(updates)
    .eq("macro_key", macroKey)
    .select(
      "id,macro_key,label,description,data_source,formatter,fallback_value,is_required,is_deprecated,is_active,created_at,updated_at"
    )
    .maybeSingle();

  if (error) {
    if (isMissingEmailMacroRegistryTableError(error)) {
      return NextResponse.json(
        { error: "Macro registry table is missing. Apply the latest Supabase migration first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Macro not found." }, { status: 404 });
  }

  return NextResponse.json({ macro: data });
}

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { macroKey: macroKeyParam } = await context.params;
  const macroKey = normalizeMacroKey(macroKeyParam);
  const keyError = validateMacroKey(macroKey);
  if (keyError) {
    return NextResponse.json({ error: keyError }, { status: 400 });
  }

  const { error } = await auth.supabase.from(TABLE).delete().eq("macro_key", macroKey);
  if (error) {
    if (isMissingEmailMacroRegistryTableError(error)) {
      return NextResponse.json(
        { error: "Macro registry table is missing. Apply the latest Supabase migration first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
