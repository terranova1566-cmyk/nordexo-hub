import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

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

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

const safeFilePath = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const resolved = path.resolve(raw);
  const allowed = path.resolve(EXTRACTOR_UPLOAD_DIR);
  if (!resolved.startsWith(`${allowed}${path.sep}`)) return null;
  if (path.extname(resolved).toLowerCase() !== ".json") return null;
  return resolved;
};

const getSelectionFilePath = async (
  adminClient: ReturnType<typeof getAdminClient>,
  provider: string,
  productId: string
) => {
  const { data, error } = await adminClient!
    .from("discovery_production_supplier_selection")
    .select("selected_offer")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const selectedOffer = (data as any)?.selected_offer;
  if (!selectedOffer || typeof selectedOffer !== "object") return null;
  return safeFilePath((selectedOffer as any)._production_payload_file_path);
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const provider = String(request.nextUrl.searchParams.get("provider") ?? "").trim();
  const productId = String(request.nextUrl.searchParams.get("product_id") ?? "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const filePath = await getSelectionFilePath(adminClient, provider, productId);
  if (!filePath) {
    return NextResponse.json({ error: "No saved payload file." }, { status: 404 });
  }

  try {
    const text = await fs.readFile(filePath, "utf8");
    return NextResponse.json({
      provider,
      product_id: productId,
      file_name: path.basename(filePath),
      text,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read payload file." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String((payload as any).provider ?? "").trim();
  const productId = String((payload as any).product_id ?? "").trim();
  const text = String((payload as any).text ?? "");
  if (!provider || !productId || !text.trim()) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const filePath = await getSelectionFilePath(adminClient, provider, productId);
  if (!filePath) {
    return NextResponse.json({ error: "No saved payload file." }, { status: 404 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON is invalid." }, { status: 400 });
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
    return NextResponse.json({
      ok: true,
      file_name: path.basename(filePath),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save payload file." },
      { status: 500 }
    );
  }
}
