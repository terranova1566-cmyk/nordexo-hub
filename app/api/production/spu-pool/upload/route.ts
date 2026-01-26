import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
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

const normalizeSpu = (value: string) => value.trim().toUpperCase();

const parseTextList = (text: string) =>
  text
    .split(/[\r\n,;]+/g)
    .map((entry) => normalizeSpu(entry))
    .filter(Boolean);

const readCellText = (cell: ExcelJS.Cell) => {
  if (!cell) return "";
  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }
  if (typeof cell.value === "number") {
    return cell.text || String(cell.value);
  }
  if (typeof cell.value === "object" && cell.value !== null) {
    if ("text" in cell.value && typeof cell.value.text === "string") {
      return cell.value.text;
    }
  }
  return cell.text?.trim?.() ?? String(cell.value ?? "").trim();
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const formData = await request.formData();
  const file = (formData.get("file") || formData.get("workbook")) as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const name = file.name?.toLowerCase() ?? "";
  const buffer = await file.arrayBuffer();
  let spus: string[] = [];

  if (name.endsWith(".txt") || name.endsWith(".csv")) {
    const text = Buffer.from(buffer).toString("utf8");
    spus = parseTextList(text);
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "Missing worksheet." }, { status: 400 });
    }
    sheet.eachRow((row, rowIndex) => {
      row.eachCell((cell) => {
        const raw = readCellText(cell);
        if (!raw) return;
        const normalized = normalizeSpu(raw);
        if (rowIndex === 1 && normalized === "SPU") return;
        spus.push(normalized);
      });
    });
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Use TXT or Excel." },
      { status: 400 }
    );
  }

  const unique = Array.from(new Set(spus)).filter(Boolean);
  if (!unique.length) {
    return NextResponse.json({ error: "No SPUs found." }, { status: 400 });
  }

  const adminClient = adminCheck.adminClient;
  const rows = unique.map((spu) => ({
    spu,
    status: "free",
    used_source: null,
    used_at: null,
  }));

  const { error } = await adminClient
    .from("production_spu_pool")
    .upsert(rows, { onConflict: "spu", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    insertedCount: rows.length,
    totalCount: unique.length,
  });
}
