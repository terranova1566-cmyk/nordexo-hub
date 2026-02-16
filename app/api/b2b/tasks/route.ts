import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createTask, listMyTasks, listProjectTasks } from "@/lib/b2b/services/tasks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const mine = (searchParams.get("mine") ?? "").toLowerCase() === "true";
  const projectId = (searchParams.get("projectId") ?? "").trim();

  try {
    if (projectId) {
      const items = await listProjectTasks(auth.supabase, projectId);
      return NextResponse.json({ items });
    }

    if (mine) {
      const items = await listMyTasks(auth.supabase, auth.user.id, { limit: 200 });
      return NextResponse.json({ items });
    }

    const items = await listMyTasks(auth.supabase, auth.user.id, { limit: 200 });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load tasks." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const projectId =
    typeof payload?.project_id === "string" ? payload.project_id.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";

  if (!projectId) {
    return NextResponse.json({ error: "Missing project_id." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }

  try {
    const id = await createTask(auth.supabase, {
      project_id: projectId,
      product_candidate_id:
        typeof payload?.product_candidate_id === "string"
          ? payload.product_candidate_id.trim()
          : null,
      assigned_to_user_id:
        typeof payload?.assigned_to_user_id === "string"
          ? payload.assigned_to_user_id.trim()
          : auth.user.id,
      title,
      description: typeof payload?.description === "string" ? payload.description : null,
      due_date: typeof payload?.due_date === "string" ? payload.due_date : null,
      status: typeof payload?.status === "string" ? payload.status : "open",
      type: typeof payload?.type === "string" ? payload.type : null,
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create task." },
      { status: 500 }
    );
  }
}

