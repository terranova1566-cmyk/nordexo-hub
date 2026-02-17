import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { buildPublicUrl } from "@/lib/public-files";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("partner_public_file_links")
    .select("id,token,file_path,original_name,created_at,expires_at,retain_until,download_count")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    files: (data ?? []).map((entry) => ({
      ...entry,
      url: buildPublicUrl(String(entry.token || "")),
    })),
  });
}
