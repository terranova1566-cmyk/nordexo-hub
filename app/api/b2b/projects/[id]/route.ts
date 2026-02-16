import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { getProject, updateProject } from "@/lib/b2b/services/projects";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const project = await getProject(auth.supabase, id);

    const [{ count: candidateCount }, { count: taskCount }] = await Promise.all([
      auth.supabase
        .from("b2b_product_candidates")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
      auth.supabase
        .from("b2b_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
    ]);

    return NextResponse.json({
      project,
      stats: {
        candidate_count: candidateCount ?? 0,
        task_count: taskCount ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load project.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    await updateProject(
      auth.supabase,
      id,
      {
        title: typeof payload?.title === "string" ? payload.title : undefined,
        description:
          payload?.description !== undefined ? (payload.description as string | null) : undefined,
        brief: payload?.brief !== undefined ? (payload.brief as string | null) : undefined,
        status: typeof payload?.status === "string" ? payload.status : undefined,
        target_start_date:
          typeof payload?.target_start_date === "string"
            ? payload.target_start_date
            : payload?.target_start_date === null
              ? null
              : undefined,
        target_end_date:
          typeof payload?.target_end_date === "string"
            ? payload.target_end_date
            : payload?.target_end_date === null
              ? null
              : undefined,
        currency: typeof payload?.currency === "string" ? payload.currency : undefined,
        exchange_rate_cny:
          payload?.exchange_rate_cny !== undefined ? Number(payload.exchange_rate_cny) : undefined,
        margin_percent_default:
          payload?.margin_percent_default !== undefined
            ? Number(payload.margin_percent_default)
            : undefined,
        margin_fixed_default:
          payload?.margin_fixed_default !== undefined
            ? Number(payload.margin_fixed_default)
            : undefined,
      },
      { updated_by: auth.user.id, forceStatus: Boolean(payload?.force_status) }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update project.";
    const status = message.toLowerCase().includes("not found")
      ? 404
      : message.toLowerCase().includes("invalid")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
