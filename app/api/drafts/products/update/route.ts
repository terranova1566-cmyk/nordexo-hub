import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_FIELDS = new Set([
  "draft_title",
  "draft_subtitle",
  "draft_source",
  "draft_supplier_1688_url",
]);

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { id, field, value } = body as {
    id?: string;
    field?: string;
    value?: string | number | null;
  };

  if (!id || !field || !ALLOWED_FIELDS.has(field)) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const updateValue = value === "" ? null : value;

  const { error } = await adminClient
    .from("draft_products")
    .update({ [field]: updateValue })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
