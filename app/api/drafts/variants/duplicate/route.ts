import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BIGINT_ID_RE = /^\d+$/;

const normalizeDraftId = (value: unknown) => {
  const text = String(value ?? "").trim();
  return BIGINT_ID_RE.test(text) ? text : null;
};

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const normalizeSkuKey = (value: string) => value.trim().toLowerCase();

const buildDuplicateSku = (baseSku: string, fallbackSpu: string, used: Set<string>) => {
  const base = baseSku.trim() || `${fallbackSpu.trim() || "sku"}`;
  let candidate = `${base}-copy`;
  let index = 2;
  while (used.has(normalizeSkuKey(candidate))) {
    candidate = `${base}-copy-${index}`;
    index += 1;
  }
  used.add(normalizeSkuKey(candidate));
  return candidate;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { ids?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const rawIds = Array.isArray(payload?.ids)
    ? payload.ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const invalidIds = rawIds.filter((id) => !BIGINT_ID_RE.test(id));
  const ids = rawIds.map((id) => normalizeDraftId(id)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids." }, { status: 400 });
  }
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Invalid variant id(s): ${invalidIds.slice(0, 3).join(", ")}` },
      { status: 400 }
    );
  }

  const { data: rows, error: fetchError } = await adminClient
    .from("draft_variants")
    .select("*")
    .in("id", ids);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No variants found." }, { status: 404 });
  }

  const spus = Array.from(
    new Set(rows.map((row) => String((row as Record<string, unknown>).draft_spu || "").trim()))
  ).filter(Boolean);

  const skuBySpu = new Map<string, Set<string>>();
  if (spus.length > 0) {
    const { data: existingRows, error: existingError } = await adminClient
      .from("draft_variants")
      .select("draft_spu,draft_sku")
      .in("draft_spu", spus);
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    (existingRows ?? []).forEach((row) => {
      const spu = String((row as Record<string, unknown>).draft_spu || "").trim();
      const sku = String((row as Record<string, unknown>).draft_sku || "").trim();
      if (!spu || !sku) return;
      const set = skuBySpu.get(spu) ?? new Set<string>();
      set.add(normalizeSkuKey(sku));
      skuBySpu.set(spu, set);
    });
  }

  const nowIso = new Date().toISOString();
  const inserts: Record<string, unknown>[] = rows.map((row) => {
    const source = row as Record<string, unknown>;
    const clone: Record<string, unknown> = { ...source };
    const spu = String(source.draft_spu || "").trim();
    const currentSku = String(source.draft_sku || "").trim();
    const used = skuBySpu.get(spu) ?? new Set<string>();
    skuBySpu.set(spu, used);
    delete clone.id;
    clone.draft_sku = buildDuplicateSku(currentSku, spu, used);
    clone.draft_updated_at = nowIso;
    clone.draft_status = source.draft_status ?? "draft";
    return clone;
  });

  const chunkSize = 150;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const { error } = await adminClient.from("draft_variants").insert(chunk);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, duplicated: inserts.length });
}
