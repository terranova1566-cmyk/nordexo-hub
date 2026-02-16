import type { SupabaseClient } from "@supabase/supabase-js";
import type { B2BCandidateStatus } from "@/lib/b2b/constants";
import { isValidCandidateStatusTransition } from "@/lib/b2b/status";
import { logActivity } from "@/lib/b2b/services/activity-log";
import type { Normalized1688Candidate, OfferDetailScrape } from "@/lib/b2b/scrapers/1688";

export const getCandidate = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("b2b_product_candidates")
    .select(
      "*, project:b2b_projects(id, title, currency, exchange_rate_cny, margin_percent_default, margin_fixed_default, customer:b2b_customers(id, name, main_currency))"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Candidate not found.");
  return data as any;
};

const upsertSupplierFrom1688 = async (
  supabase: SupabaseClient,
  normalized: Normalized1688Candidate,
  opts: { created_by?: string | null } = {}
) => {
  if (!normalized.supplierName) return null;

  const { data: existing } = await supabase
    .from("b2b_suppliers")
    .select("id")
    .eq("platform", "1688")
    .eq("internal_name", normalized.supplierName)
    .is("platform_store_url", null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const payload = {
    platform: "1688",
    internal_name: normalized.supplierName,
    created_by: opts.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_suppliers")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;

  await logActivity(supabase, {
    entity_type: "supplier",
    entity_id: data.id,
    action: "supplier.create",
    diff: payload,
    created_by: opts.created_by ?? null,
  });

  return data.id as string;
};

export const createCandidateFrom1688 = async (
  supabase: SupabaseClient,
  input: {
    project_id: string;
    source_url: string;
    scrape: OfferDetailScrape;
    normalized: Normalized1688Candidate;
    created_by?: string | null;
  }
) => {
  const supplierId = await upsertSupplierFrom1688(supabase, input.normalized, {
    created_by: input.created_by ?? null,
  });

  const payload = {
    project_id: input.project_id,
    source_type: "1688_product_url",
    source_url: input.source_url,
    supplier_id: supplierId,
    raw_scrape_json: input.scrape as unknown,
    title: input.normalized.title,
    images: input.normalized.images,
    gallery_images: input.normalized.galleryImages,
    description_images: input.normalized.descriptionImages,
    price_tiers: input.normalized.priceTiers,
    source_currency: "CNY",
    source_price_min_cny: input.normalized.sourcePriceMinCny,
    source_price_max_cny: input.normalized.sourcePriceMaxCny,
    moq: input.normalized.moq,
    variants: input.normalized.variants,
    packaging: input.normalized.packaging,
    lead_times: input.normalized.leadTimes,
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_product_candidates")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create candidate.");

  await logActivity(supabase, {
    entity_type: "candidate",
    entity_id: data.id,
    action: "candidate.create",
    diff: {
      project_id: input.project_id,
      source_type: "1688_product_url",
      source_url: input.source_url,
      supplier_id: supplierId,
      title: input.normalized.title,
      moq: input.normalized.moq,
      image_count: input.normalized.images.length,
      gallery_image_count: input.normalized.galleryImages.length,
      description_image_count: input.normalized.descriptionImages.length,
      source_price_min_cny: input.normalized.sourcePriceMinCny,
      source_price_max_cny: input.normalized.sourcePriceMaxCny,
    },
    created_by: input.created_by ?? null,
  });

  return data.id as string;
};

export const updateCandidate = async (
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  opts: { updated_by?: string | null; forceStatus?: boolean } = {}
) => {
  const { data: existing, error: existingError } = await supabase
    .from("b2b_product_candidates")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing?.id) throw new Error("Candidate not found.");

  const updates: Record<string, unknown> = {};

  const stringFields = ["title", "notes"] as const;
  stringFields.forEach((field) => {
    if (typeof patch[field] === "string") updates[field] = (patch[field] as string).trim();
  });

  const numberFields = [
    "source_price_min_cny",
    "source_price_max_cny",
    "final_price_with_logo_cny",
    "final_price_without_logo_cny",
    "margin_percent_override",
    "margin_fixed_override",
    "final_lead_time_days",
  ] as const;
  numberFields.forEach((field) => {
    const v = patch[field];
    if (v === null) {
      updates[field] = null;
      return;
    }
    if (typeof v === "number" && Number.isFinite(v)) updates[field] = v;
    if (typeof v === "string") {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) updates[field] = parsed;
    }
  });

  const intFields = ["moq", "final_moq"] as const;
  intFields.forEach((field) => {
    const v = patch[field];
    if (v === null) {
      updates[field] = null;
      return;
    }
    const parsed = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(parsed)) updates[field] = Math.trunc(parsed);
  });

  const jsonFields = ["branding_costs_cny", "packaging_costs_cny", "packaging", "lead_times", "variants"] as const;
  jsonFields.forEach((field) => {
    if (patch[field] !== undefined) updates[field] = patch[field];
  });

  if (typeof patch.is_shortlisted === "boolean") {
    updates.is_shortlisted = patch.is_shortlisted;
  }

  if (typeof patch.status === "string") {
    const from = existing.status as B2BCandidateStatus;
    const to = patch.status as B2BCandidateStatus;
    if (!opts.forceStatus && from !== to && !isValidCandidateStatusTransition(from, to)) {
      throw new Error(`Invalid candidate status transition: ${from} -> ${to}`);
    }
    updates.status = to;
  }

  const { data, error } = await supabase
    .from("b2b_product_candidates")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Candidate not found.");

  await logActivity(supabase, {
    entity_type: "candidate",
    entity_id: id,
    action: "candidate.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  return true;
};
