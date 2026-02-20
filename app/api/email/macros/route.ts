import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  isMissingEmailMacroRegistryTableError,
  listEmailMacroDefinitions,
  normalizeMacroKey,
  validateMacroKey,
} from "@/lib/email-macro-registry";

export const runtime = "nodejs";

const TABLE = "partner_email_macro_registry";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { macros, missingTable } = await listEmailMacroDefinitions(auth.supabase, {
      includeInactive: true,
      includeDeprecated: true,
    });
    return NextResponse.json({ macros, missingTable });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to load macros." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const macroKey = normalizeMacroKey(payload.macro_key || payload.macroKey);
  const keyError = validateMacroKey(macroKey);
  if (keyError) {
    return NextResponse.json({ error: keyError }, { status: 400 });
  }

  const label = String(payload.label ?? "").trim() || macroKey;
  const description = String(payload.description ?? "").trim() || null;
  const dataSource = String(payload.data_source ?? payload.dataSource ?? "variables").trim() || "variables";
  const formatter = String(payload.formatter ?? "").trim() || null;
  const fallbackValue = String(payload.fallback_value ?? payload.fallbackValue ?? "").trim() || null;
  const isRequired = Boolean(payload.is_required ?? payload.isRequired);
  const isDeprecated = Boolean(payload.is_deprecated ?? payload.isDeprecated);
  const isActive = payload.is_active === undefined && payload.isActive === undefined
    ? true
    : Boolean(payload.is_active ?? payload.isActive);

  const { data, error } = await auth.supabase
    .from(TABLE)
    .insert({
      macro_key: macroKey,
      label,
      description,
      data_source: dataSource,
      formatter,
      fallback_value: fallbackValue,
      is_required: isRequired,
      is_deprecated: isDeprecated,
      is_active: isActive,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
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

  return NextResponse.json({ macro: data });
}
