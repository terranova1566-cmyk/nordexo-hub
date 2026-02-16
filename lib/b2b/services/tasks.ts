import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/b2b/services/activity-log";

export const listMyTasks = async (
  supabase: SupabaseClient,
  userId: string,
  opts: { limit?: number } = {}
) => {
  const limit = Math.max(1, Math.min(200, Math.trunc(opts.limit ?? 100)));
  const { data, error } = await supabase
    .from("b2b_tasks")
    .select(
      "id, title, status, due_date, type, project_id, product_candidate_id, updated_at, project:b2b_projects(id, title), candidate:b2b_product_candidates(id, title)"
    )
    .eq("assigned_to_user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

export const listProjectTasks = async (supabase: SupabaseClient, projectId: string) => {
  const { data, error } = await supabase
    .from("b2b_tasks")
    .select(
      "id, title, status, due_date, type, assigned_to_user_id, product_candidate_id, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

export const createTask = async (
  supabase: SupabaseClient,
  input: {
    project_id: string;
    title: string;
    description?: string | null;
    due_date?: string | null;
    status?: string | null;
    type?: string | null;
    assigned_to_user_id?: string | null;
    product_candidate_id?: string | null;
    created_by?: string | null;
  }
) => {
  const payload = {
    project_id: input.project_id,
    product_candidate_id: input.product_candidate_id ?? null,
    assigned_to_user_id: input.assigned_to_user_id ?? null,
    title: input.title.trim(),
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    status: input.status ?? "open",
    type: input.type ?? null,
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_tasks")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create task.");

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: data.id,
    action: "task.create",
    diff: payload,
    created_by: input.created_by ?? null,
  });

  // Also log at project / candidate level for traceability.
  await logActivity(supabase, {
    entity_type: "project",
    entity_id: input.project_id,
    action: "project.task_created",
    diff: { task_id: data.id, title: payload.title, due_date: payload.due_date },
    created_by: input.created_by ?? null,
  });
  if (input.product_candidate_id) {
    await logActivity(supabase, {
      entity_type: "candidate",
      entity_id: input.product_candidate_id,
      action: "candidate.task_created",
      diff: { task_id: data.id, title: payload.title, due_date: payload.due_date },
      created_by: input.created_by ?? null,
    });
  }

  return data.id as string;
};

export const updateTask = async (
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    type: string | null;
    assigned_to_user_id: string | null;
  }>,
  opts: { updated_by?: string | null } = {}
) => {
  const updates: Record<string, unknown> = {};
  if (typeof patch.title === "string") updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description ?? null;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date ?? null;
  if (typeof patch.status === "string") updates.status = patch.status;
  if (patch.type !== undefined) updates.type = patch.type ?? null;
  if (patch.assigned_to_user_id !== undefined) {
    updates.assigned_to_user_id = patch.assigned_to_user_id ?? null;
  }

  const { data, error } = await supabase
    .from("b2b_tasks")
    .update(updates)
    .eq("id", id)
    .select("id, project_id, product_candidate_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Task not found.");

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id,
    action: "task.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  if (typeof patch.status === "string") {
    await logActivity(supabase, {
      entity_type: "project",
      entity_id: data.project_id,
      action: "project.task_status_changed",
      diff: { task_id: id, status: patch.status },
      created_by: opts.updated_by ?? null,
    });
    if (data.product_candidate_id) {
      await logActivity(supabase, {
        entity_type: "candidate",
        entity_id: data.product_candidate_id,
        action: "candidate.task_status_changed",
        diff: { task_id: id, status: patch.status },
        created_by: opts.updated_by ?? null,
      });
    }
  }

  return true;
};

