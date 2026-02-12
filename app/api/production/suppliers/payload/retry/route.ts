import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SUPPLIER_PAYLOAD_WORKER_PATH =
  "/srv/nordexo-hub/scripts/production-supplier-fetch-worker.mjs";

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
  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Server is missing Supabase credentials." },
        { status: 500 }
      ),
    };
  }
  return { ok: true as const, adminClient };
}

const spawnSupplierPayloadWorkerBestEffort = (provider: string, productId: string) => {
  try {
    const child = spawn(
      process.execPath,
      [
        SUPPLIER_PAYLOAD_WORKER_PATH,
        "--provider",
        provider,
        "--product-id",
        productId,
      ],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const adminClient = auth.adminClient;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String((payload as any).provider || "").trim();
  const productId = String((payload as any).product_id || "").trim();
  const competitorUrl = String((payload as any).competitor_url || "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }
  if (competitorUrl && !/^https?:\/\//i.test(competitorUrl)) {
    return NextResponse.json({ error: "Competitor URL must be a valid http(s) URL." }, { status: 400 });
  }

  const { data: selectionRow, error: selectionError } = await adminClient
    .from("discovery_production_supplier_selection")
    .select("provider, product_id, selected_offer")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();

  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500 });
  }
  if (!selectionRow) {
    return NextResponse.json({ error: "No selected supplier found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const selectedOffer =
    selectionRow.selected_offer && typeof selectionRow.selected_offer === "object"
      ? (selectionRow.selected_offer as Record<string, unknown>)
      : {};
  const updatedOffer = {
    ...selectedOffer,
    _production_payload_status: "fetching",
    _production_payload_source: "auto",
    _production_payload_error: null,
    _production_payload_saved_at: null,
    _production_payload_updated_at: now,
    _production_payload_competitor_error: null,
    _production_payload_competitor_override_url: competitorUrl || null,
  };

  const { error: updateError } = await adminClient
    .from("discovery_production_supplier_selection")
    .update({
      selected_offer: updatedOffer,
      updated_at: now,
    })
    .eq("provider", provider)
    .eq("product_id", productId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const workerStarted = spawnSupplierPayloadWorkerBestEffort(provider, productId);

  return NextResponse.json({
    ok: true,
    worker_started: workerStarted,
    provider,
    product_id: productId,
  });
}
