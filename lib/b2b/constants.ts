export const B2B_ENTITY_TYPES = [
  "customer",
  "project",
  "candidate",
  "supplier",
  "lookbook",
  "lookbook_item",
  "task",
  "share_link",
] as const;

export type B2BEntityType = (typeof B2B_ENTITY_TYPES)[number];

export const B2B_PROJECT_STATUSES = [
  "lead",
  "sourcing",
  "sampling",
  "negotiation",
  "ordering",
  "production",
  "shipping",
  "complete",
  "paused",
  "cancelled",
] as const;
export type B2BProjectStatus = (typeof B2B_PROJECT_STATUSES)[number];

export const B2B_CANDIDATE_STATUSES = [
  "candidate",
  "contacting",
  "sampling",
  "negotiating",
  "approved",
  "ordered",
  "in_production",
  "shipped",
  "delivered",
  "dropped",
] as const;
export type B2BCandidateStatus = (typeof B2B_CANDIDATE_STATUSES)[number];

export const B2B_TASK_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
] as const;
export type B2BTaskStatus = (typeof B2B_TASK_STATUSES)[number];

export const B2B_SHARE_LINK_TYPES = ["lookbook", "project", "product"] as const;
export type B2BShareLinkType = (typeof B2B_SHARE_LINK_TYPES)[number];

export const B2B_SHARE_PERMISSIONS = ["view", "select", "comment"] as const;
export type B2BSharePermission = (typeof B2B_SHARE_PERMISSIONS)[number];

export const B2B_SELECTION_STATES = [
  "selected",
  "favorited",
  "unselected",
  "rejected",
] as const;
export type B2BSelectionState = (typeof B2B_SELECTION_STATES)[number];

export const B2B_SOURCE_TYPES = ["1688_product_url", "manual"] as const;
export type B2BSourceType = (typeof B2B_SOURCE_TYPES)[number];

export const B2B_SUPPLIER_PLATFORMS = ["1688"] as const;
export type B2BSupplierPlatform = (typeof B2B_SUPPLIER_PLATFORMS)[number];

export const B2B_CONVERSATION_CHANNELS = [
  "wechat",
  "whatsapp",
  "email",
  "call",
  "other",
] as const;
export type B2BConversationChannel = (typeof B2B_CONVERSATION_CHANNELS)[number];

