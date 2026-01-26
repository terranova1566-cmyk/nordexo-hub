import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

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

const escapeCsv = (value: string | null) => {
  if (!value) return "";
  const escaped = value.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return new Response(adminCheck.error, { status: adminCheck.status });
  }

  const url = new URL(request.url);
  const statusParam = (url.searchParams.get("status") || "all").toLowerCase();
  const status =
    statusParam === "free" || statusParam === "used" ? statusParam : "all";

  let query = adminCheck.adminClient
    .from("production_spu_pool")
    .select("spu,status,used_source,used_at,created_at")
    .order("spu", { ascending: true });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = data ?? [];
  const header = [
    "spu",
    "status",
    "used_source",
    "used_at",
    "created_at",
  ];

  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        escapeCsv(row.spu),
        escapeCsv(row.status),
        escapeCsv(row.used_source),
        escapeCsv(row.used_at),
        escapeCsv(row.created_at),
      ].join(",")
    );
  });

  const fileName = `production-spus-${status}.csv`;
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
