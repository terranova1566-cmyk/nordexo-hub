import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { updateTask } from "@/lib/b2b/services/tasks";

export const runtime = "nodejs";

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
    await updateTask(
      auth.supabase,
      id,
      {
        title: typeof payload?.title === "string" ? payload.title : undefined,
        description:
          payload?.description !== undefined ? (payload.description as string | null) : undefined,
        due_date: payload?.due_date !== undefined ? (payload.due_date as string | null) : undefined,
        status: typeof payload?.status === "string" ? payload.status : undefined,
        type: payload?.type !== undefined ? (payload.type as string | null) : undefined,
        assigned_to_user_id:
          payload?.assigned_to_user_id !== undefined
            ? (payload.assigned_to_user_id as string | null)
            : undefined,
      },
      { updated_by: auth.user.id }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update task.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

