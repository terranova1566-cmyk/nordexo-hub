import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { createServerSupabase } from "@/lib/supabase/server";
import { EXTRACTOR_UPLOAD_DIR, parseExtractorPayload } from "@/lib/1688-extractor";

export const runtime = "nodejs";

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

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; adminClient: AdminClient }
> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient: adminClient as AdminClient };
};

const extractUrl = (record: Record<string, unknown>) => {
  const keys = [
    "url_1688",
    "url",
    "link",
    "product_url",
    "productUrl",
    "detail_url",
    "detailUrl",
    "offer_url",
    "offerUrl",
  ];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const list = record.url_1688_list;
  if (Array.isArray(list) && list.length) {
    const first = list.find((entry) => typeof entry === "string" && entry.trim());
    if (first) return String(first).trim();
  }
  return "";
};

const looksLikeSpu = (value: string) => /^[A-Z]{2,4}-\d{2,}$/i.test(value);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { name } = await params;
  const safeName = path.basename(decodeURIComponent(name));
  if (!safeName || safeName !== name) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const filePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return NextResponse.json({ error: "Unable to read file." }, { status: 500 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON file." }, { status: 400 });
  }

  const items: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
    ? payload.items
    : [];

  const missingIndexes: number[] = [];
  items.forEach((item, idx) => {
    const spu = String(item?.spu ?? "").trim();
    const sku = String(item?.sku ?? "").trim();
    if (spu) return;
    if (sku && looksLikeSpu(sku)) return;
    missingIndexes.push(idx);
  });

  if (!missingIndexes.length) {
    return NextResponse.json({
      status: "already",
      assignedCount: 0,
      preview: parseExtractorPayload(payload),
    });
  }

  const adminClient = adminCheck.adminClient as AdminClient;
  const { data: available, error } = await adminClient
    .from("production_spu_pool")
    .select("spu")
    .eq("status", "free")
    .order("spu", { ascending: true })
    .limit(missingIndexes.length);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!available || available.length < missingIndexes.length) {
    return NextResponse.json(
      { error: "Not enough free SPUs available." },
      { status: 400 }
    );
  }

  const assignments: { spu: string; url: string }[] = [];
  missingIndexes.forEach((idx, position) => {
    const spu = available[position].spu;
    const item = items[idx];
    const url = item ? extractUrl(item) : "";
    item.spu = spu;
    const sku = String(item?.sku ?? "").trim();
    if (!sku || !looksLikeSpu(sku)) {
      if (sku) {
        item.original_sku = sku;
      }
      item.sku = spu;
    }
    assignments.push({ spu, url });
  });

  for (const assignment of assignments) {
    await adminClient
      .from("production_spu_pool")
      .update({
        status: "used",
        used_source: assignment.url || null,
        used_at: new Date().toISOString(),
      })
      .eq("spu", assignment.spu)
      .eq("status", "free");
  }

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

  return NextResponse.json({
    status: "assigned",
    assignedCount: assignments.length,
    preview: parseExtractorPayload(payload),
  });
}
