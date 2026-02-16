import type { SupabaseClient } from "@supabase/supabase-js";
import type { B2BEntityType } from "@/lib/b2b/constants";

export type ActivityLogEntry = {
  entity_type: B2BEntityType;
  entity_id: string;
  action: string;
  diff?: Record<string, unknown> | null;
  created_by?: string | null;
};

export const logActivity = async (
  supabase: SupabaseClient,
  entry: ActivityLogEntry
) => {
  const payload = {
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    diff: entry.diff ?? {},
    created_by: entry.created_by ?? null,
  };

  // Don't block the main flow on logging failures.
  try {
    await supabase.from("b2b_activity_log").insert(payload);
  } catch {}
};

