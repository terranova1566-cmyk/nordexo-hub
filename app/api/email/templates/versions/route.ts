import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const templateId = String(url.searchParams.get("template_id") || "").trim();
  if (!templateId) {
    return NextResponse.json({ error: "template_id is required." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("partner_email_template_versions")
    .select("id,template_id,subject_template,body_template,macros,created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
