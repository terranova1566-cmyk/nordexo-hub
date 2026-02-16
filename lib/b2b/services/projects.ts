import type { SupabaseClient } from "@supabase/supabase-js";
import type { B2BProjectStatus } from "@/lib/b2b/constants";
import { isValidProjectStatusTransition } from "@/lib/b2b/status";
import { logActivity } from "@/lib/b2b/services/activity-log";

export type ProjectRow = {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  brief: string | null;
  status: B2BProjectStatus;
  target_start_date: string | null;
  target_end_date: string | null;
  currency: string;
  exchange_rate_cny: number;
  margin_percent_default: number;
  margin_fixed_default: number;
  created_at: string;
  updated_at: string;
};

export const listProjects = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from("b2b_projects")
    .select(
      "id, title, status, updated_at, customer:b2b_customers(id, name, main_currency)"
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      customer: customer?.id ? customer : null,
    };
  }) as Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
    customer: { id: string; name: string; main_currency: string } | null;
  }>;
};

export const getProject = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("b2b_projects")
    .select(
      "id, customer_id, title, description, brief, status, target_start_date, target_end_date, currency, exchange_rate_cny, margin_percent_default, margin_fixed_default, created_at, updated_at, customer:b2b_customers(id, name, main_currency)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found.");
  const customer = Array.isArray((data as any).customer) ? (data as any).customer[0] : (data as any).customer;
  return {
    ...(data as any),
    customer: customer?.id ? customer : null,
  } as ProjectRow & { customer: { id: string; name: string; main_currency: string } | null };
};

export const createProject = async (
  supabase: SupabaseClient,
  input: {
    customer_id: string;
    title: string;
    description?: string | null;
    brief?: string | null;
    currency?: string | null;
    exchange_rate_cny?: number | null;
    margin_percent_default?: number | null;
    margin_fixed_default?: number | null;
    created_by?: string | null;
  }
) => {
  const { data: customerRow, error: customerError } = await supabase
    .from("b2b_customers")
    .select("id, main_currency")
    .eq("id", input.customer_id)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customerRow?.id) throw new Error("Customer not found.");

  const payload = {
    customer_id: input.customer_id,
    title: input.title.trim(),
    description: input.description ?? null,
    brief: input.brief ?? null,
    currency: input.currency?.trim() || (customerRow.main_currency as string) || "SEK",
    exchange_rate_cny:
      typeof input.exchange_rate_cny === "number" && Number.isFinite(input.exchange_rate_cny)
        ? input.exchange_rate_cny
        : 1,
    margin_percent_default:
      typeof input.margin_percent_default === "number" &&
      Number.isFinite(input.margin_percent_default)
        ? input.margin_percent_default
        : 0,
    margin_fixed_default:
      typeof input.margin_fixed_default === "number" &&
      Number.isFinite(input.margin_fixed_default)
        ? input.margin_fixed_default
        : 0,
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_projects")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create project.");

  await logActivity(supabase, {
    entity_type: "project",
    entity_id: data.id,
    action: "project.create",
    diff: payload,
    created_by: input.created_by ?? null,
  });

  return data.id as string;
};

export const updateProject = async (
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      ProjectRow,
      | "title"
      | "description"
      | "brief"
      | "status"
      | "target_start_date"
      | "target_end_date"
      | "currency"
      | "exchange_rate_cny"
      | "margin_percent_default"
      | "margin_fixed_default"
    >
  >,
  opts: { updated_by?: string | null; forceStatus?: boolean } = {}
) => {
  const { data: existing, error: existingError } = await supabase
    .from("b2b_projects")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing?.id) throw new Error("Project not found.");

  const updates: Record<string, unknown> = {};
  if (typeof patch.title === "string") updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description ?? null;
  if (patch.brief !== undefined) updates.brief = patch.brief ?? null;
  if (typeof patch.currency === "string") updates.currency = patch.currency.trim() || "SEK";
  if (typeof patch.exchange_rate_cny === "number" && Number.isFinite(patch.exchange_rate_cny)) {
    updates.exchange_rate_cny = patch.exchange_rate_cny;
  }
  if (
    typeof patch.margin_percent_default === "number" &&
    Number.isFinite(patch.margin_percent_default)
  ) {
    updates.margin_percent_default = patch.margin_percent_default;
  }
  if (typeof patch.margin_fixed_default === "number" && Number.isFinite(patch.margin_fixed_default)) {
    updates.margin_fixed_default = patch.margin_fixed_default;
  }
  if (patch.target_start_date !== undefined) {
    updates.target_start_date = patch.target_start_date || null;
  }
  if (patch.target_end_date !== undefined) {
    updates.target_end_date = patch.target_end_date || null;
  }

  if (typeof patch.status === "string") {
    const from = existing.status as B2BProjectStatus;
    const to = patch.status as B2BProjectStatus;
    if (!opts.forceStatus && from !== to && !isValidProjectStatusTransition(from, to)) {
      throw new Error(`Invalid project status transition: ${from} -> ${to}`);
    }
    updates.status = to;
  }

  const { data, error } = await supabase
    .from("b2b_projects")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Project not found.");

  await logActivity(supabase, {
    entity_type: "project",
    entity_id: id,
    action: "project.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  return true;
};

export const listProjectCandidates = async (
  supabase: SupabaseClient,
  projectId: string
) => {
  const { data, error } = await supabase
    .from("b2b_product_candidates")
    .select(
      "id, title, images, gallery_images, description_images, status, moq, source_price_min_cny, source_price_max_cny, final_price_without_logo_cny, final_price_with_logo_cny, updated_at, is_shortlisted"
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
};

export const buildOfferExportPayload = async (
  supabase: SupabaseClient,
  projectId: string
) => {
  const project = await getProject(supabase, projectId);
  const candidates = await listProjectCandidates(supabase, projectId);

  return {
    kind: "offer",
    generated_at: new Date().toISOString(),
    project,
    candidates,
    todo:
      "TODO: format into PDF/Excel with a polished template. This endpoint currently returns structured JSON.",
  };
};

export const buildInvoiceExportPayload = async (
  supabase: SupabaseClient,
  projectId: string
) => {
  const project = await getProject(supabase, projectId);
  const candidates = await listProjectCandidates(supabase, projectId);

  return {
    kind: "invoice",
    generated_at: new Date().toISOString(),
    project,
    candidates,
    todo:
      "TODO: format into PDF/Excel with a polished template. This endpoint currently returns structured JSON.",
  };
};
