import { computeCustomerUnitPrice } from "@/lib/b2b/pricing";

export type ShareCandidatePublic = {
  id: string;
  title: string | null;
  image: string | null;
  images: string[];
  moq: number | null;
  lead_time_days: number | null;
  customer_unit_price: number | null;
  currency: string;
};

export type ShareLookbookItemPublic = {
  id: string;
  title: string | null;
  image: string | null;
  customer_unit_price: number | null;
  currency: string;
  product_candidate_id: string | null;
};

export const sanitizeCandidateForShare = (input: {
  candidate: {
    id: string;
    title: string | null;
    images: string[] | null;
    moq: number | null;
    final_moq: number | null;
    final_price_without_logo_cny: number | null;
    final_price_with_logo_cny: number | null;
    branding_costs_cny: unknown;
    packaging_costs_cny: unknown;
    lead_times?: unknown;
    margin_percent_override: number | null;
    margin_fixed_override: number | null;
    final_lead_time_days: number | null;
    // Sensitive fields may exist but must be ignored here (supplier_id, source_url, etc.)
  };
  project: {
    currency: string;
    exchange_rate_cny: number;
    margin_percent_default: number;
    margin_fixed_default: number;
  };
}): ShareCandidatePublic => {
  const { candidate, project } = input;
  const images = Array.isArray(candidate.images) ? candidate.images.filter(Boolean) : [];
  const unitCostCny =
    candidate.final_price_without_logo_cny ??
    candidate.final_price_with_logo_cny ??
    null;

  const marginPercent =
    candidate.margin_percent_override ?? project.margin_percent_default ?? 0;
  const marginFixed =
    candidate.margin_fixed_override ?? project.margin_fixed_default ?? 0;

  const computed = unitCostCny !== null
    ? computeCustomerUnitPrice({
        currency: project.currency,
        exchangeRateCny: project.exchange_rate_cny,
        unitCostCny,
        brandingCostsCny: candidate.branding_costs_cny,
        packagingCostsCny: candidate.packaging_costs_cny,
        margin: {
          marginPercent,
          marginFixed,
        },
      })
    : { ok: false as const, error: "No final price." };

  const customerUnitPrice = computed.ok ? computed.customerUnitPrice : null;

  return {
    id: candidate.id,
    title: candidate.title ?? null,
    image: images[0] ?? null,
    images,
    moq: candidate.final_moq ?? candidate.moq ?? null,
    lead_time_days: candidate.final_lead_time_days ?? null,
    customer_unit_price: customerUnitPrice,
    currency: project.currency,
  } as ShareCandidatePublic;
};

export const sanitizeLookbookItemForShare = (input: {
  item: {
    id: string;
    title: string | null;
    image_url: string | null;
    preview_price_cny: number | null;
    product_candidate_id: string | null;
  };
  project?: {
    currency: string;
    exchange_rate_cny: number;
    margin_percent_default: number;
    margin_fixed_default: number;
  } | null;
  candidatePublic?: ShareCandidatePublic | null;
}): ShareLookbookItemPublic => {
  const { item, candidatePublic, project } = input;

  if (candidatePublic) {
    return {
      id: item.id,
      title: candidatePublic.title,
      image: candidatePublic.image,
      customer_unit_price: candidatePublic.customer_unit_price,
      currency: candidatePublic.currency,
      product_candidate_id: candidatePublic.id,
    };
  }

  const unitCostCny =
    item.preview_price_cny !== null && item.preview_price_cny !== undefined
      ? Number(item.preview_price_cny)
      : null;

  const computed =
    unitCostCny !== null && project
      ? computeCustomerUnitPrice({
          currency: project.currency,
          exchangeRateCny: project.exchange_rate_cny,
          unitCostCny,
          margin: {
            marginPercent: project.margin_percent_default ?? 0,
            marginFixed: project.margin_fixed_default ?? 0,
          },
        })
      : { ok: false as const, error: "No project/cost." };

  return {
    id: item.id,
    title: item.title ?? null,
    image: item.image_url ?? null,
    customer_unit_price: computed.ok ? computed.customerUnitPrice : null,
    currency: project?.currency ?? "SEK",
    product_candidate_id: item.product_candidate_id ?? null,
  };
};
