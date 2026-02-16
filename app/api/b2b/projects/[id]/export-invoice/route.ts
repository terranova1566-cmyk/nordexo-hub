import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { buildInvoiceExportPayload } from "@/lib/b2b/services/projects";
import { logActivity } from "@/lib/b2b/services/activity-log";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const payload = await buildInvoiceExportPayload(auth.supabase, id);
    await logActivity(auth.supabase, {
      entity_type: "project",
      entity_id: id,
      action: "project.export_invoice",
      diff: { kind: "invoice" },
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to generate invoice export.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

