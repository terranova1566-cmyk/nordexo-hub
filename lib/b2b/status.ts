import type { B2BCandidateStatus, B2BProjectStatus } from "@/lib/b2b/constants";

const projectTransitions: Record<B2BProjectStatus, B2BProjectStatus[]> = {
  lead: ["sourcing", "paused", "cancelled"],
  sourcing: ["sampling", "negotiation", "paused", "cancelled"],
  sampling: ["negotiation", "ordering", "paused", "cancelled"],
  negotiation: ["ordering", "paused", "cancelled"],
  ordering: ["production", "paused", "cancelled"],
  production: ["shipping", "paused", "cancelled"],
  shipping: ["complete", "paused", "cancelled"],
  complete: [],
  paused: [
    "lead",
    "sourcing",
    "sampling",
    "negotiation",
    "ordering",
    "production",
    "shipping",
    "cancelled",
  ],
  cancelled: [],
};

const candidateTransitions: Record<B2BCandidateStatus, B2BCandidateStatus[]> = {
  candidate: ["contacting", "dropped"],
  contacting: ["sampling", "negotiating", "dropped"],
  sampling: ["negotiating", "approved", "dropped"],
  negotiating: ["approved", "dropped"],
  approved: ["ordered", "dropped"],
  ordered: ["in_production", "dropped"],
  in_production: ["shipped", "dropped"],
  shipped: ["delivered", "dropped"],
  delivered: [],
  dropped: [],
};

export const isValidProjectStatusTransition = (
  from: B2BProjectStatus,
  to: B2BProjectStatus
) => projectTransitions[from]?.includes(to) ?? false;

export const isValidCandidateStatusTransition = (
  from: B2BCandidateStatus,
  to: B2BCandidateStatus
) => candidateTransitions[from]?.includes(to) ?? false;

