import type { SupabaseClient } from "@supabase/supabase-js";
import { collectMacros } from "@/lib/email-templates";

const EMAIL_MACRO_TABLE = "partner_email_macro_registry";
const MACRO_KEY_PATTERN = /^[A-Za-z0-9_]{2,64}$/;

type EmailMacroRow = {
  id: string;
  macro_key: string;
  label: string;
  description: string | null;
  data_source: string | null;
  formatter: string | null;
  fallback_value: string | null;
  is_required: boolean | null;
  is_deprecated: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EmailMacroDefinition = {
  id: string;
  macroKey: string;
  label: string;
  description: string | null;
  dataSource: string;
  formatter: string | null;
  fallbackValue: string | null;
  isRequired: boolean;
  isDeprecated: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TemplateMacroValidation = {
  detectedMacros: string[];
  unknownMacros: string[];
  deprecatedMacros: string[];
};

export type ResolvedTemplateMacros = {
  detectedMacros: string[];
  unknownMacros: string[];
  deprecatedMacros: string[];
  missingRequiredMacros: string[];
  values: Record<string, string>;
};

type ResolveMacroContext = {
  variables?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

const DEFAULT_EMAIL_MACRO_DEFINITIONS: EmailMacroDefinition[] = [
  {
    id: "default-partner-name",
    macroKey: "partner_name",
    label: "Partner name",
    description: "Display name for the partner receiving the email.",
    dataSource: "variables.partner_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-products-csv-url",
    macroKey: "products_csv_url",
    label: "Products CSV URL",
    description: "Public URL to the generated product spreadsheet.",
    dataSource: "variables.products_csv_url",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-top-sellers-url",
    macroKey: "top_sellers_url",
    label: "Top sellers URL",
    description: "Public URL to the top-sellers report.",
    dataSource: "variables.top_sellers_url",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-date-range",
    macroKey: "date_range",
    label: "Date range",
    description: "Date span rendered in partner update emails.",
    dataSource: "variables.date_range",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-partner-contact-name",
    macroKey: "PARTNER_CONTACT_NAME",
    label: "Partner contact name",
    description: "Named contact for the recipient partner account.",
    dataSource: "variables.PARTNER_CONTACT_NAME",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-number",
    macroKey: "orders_number",
    label: "Online order number",
    description:
      "Resolved online order reference using fallback: sales channel -> marketplace -> standard order number.",
    dataSource: "variables.orders_number",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-date",
    macroKey: "orders_date",
    label: "Order date",
    description: "Primary order date used in communication templates.",
    dataSource: "variables.orders_date",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-transaction-date",
    macroKey: "orders_transaction_date",
    label: "Order transaction date",
    description: "Order transaction date (YYYY-MM-DD when available).",
    dataSource: "variables.orders_transaction_date",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-ship-date",
    macroKey: "orders_ship_date",
    label: "Order ship date",
    description: "Shipping date for the order (YYYY-MM-DD when available).",
    dataSource: "variables.orders_ship_date",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-date-shipped",
    macroKey: "orders_date_shipped",
    label: "Order date shipped",
    description: "Alias for the order shipping date.",
    dataSource: "variables.orders_date_shipped",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-customer-name",
    macroKey: "orders_customer_name",
    label: "Order customer name",
    description: "Customer full name for the order.",
    dataSource: "variables.orders_customer_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-customer-email",
    macroKey: "orders_customer_email",
    label: "Order customer email",
    description: "Customer email address for the order.",
    dataSource: "variables.orders_customer_email",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-status",
    macroKey: "orders_status",
    label: "Order status",
    description: "Current order status string.",
    dataSource: "variables.orders_status",
    formatter: "trim|lower",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-platform-id",
    macroKey: "orders_platform_id",
    label: "Order platform ID",
    description: "Platform/sales channel identifier for the order.",
    dataSource: "variables.orders_platform_id",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-orders-platform-name",
    macroKey: "orders_platform_name",
    label: "Order platform name",
    description: "Normalized platform/seller name for the order.",
    dataSource: "variables.orders_platform_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-order-content-list",
    macroKey: "order_content_list",
    label: "Order content list",
    description: "Order products listed as one row per item: quantity x title.",
    dataSource: "variables.order_content_list",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-platform-id",
    macroKey: "platform_id",
    label: "Platform ID",
    description: "Partner platform/sales channel identifier from the order.",
    dataSource: "variables.platform_id",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-platform-name",
    macroKey: "platform_name",
    label: "Platform name",
    description: "Partner platform/sales channel display name.",
    dataSource: "variables.platform_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-platform-seller-name",
    macroKey: "platform_seller_name",
    label: "Platform seller name",
    description: "Seller name alias mapped from platform name.",
    dataSource: "variables.platform_seller_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "default-seller-name",
    macroKey: "seller_name",
    label: "Seller name",
    description: "Legacy seller alias mapped from platform name.",
    dataSource: "variables.seller_name",
    formatter: "trim",
    fallbackValue: null,
    isRequired: false,
    isDeprecated: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
];

export function validateMacroKey(value: string): string | null {
  if (!MACRO_KEY_PATTERN.test(value)) {
    return "Macro key must be 2-64 chars and use letters, numbers, or underscore.";
  }
  return null;
}

export function normalizeMacroKey(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMacroRow(row: EmailMacroRow): EmailMacroDefinition {
  return {
    id: String(row.id ?? ""),
    macroKey: normalizeMacroKey(row.macro_key),
    label: String(row.label ?? "").trim() || normalizeMacroKey(row.macro_key),
    description: row.description ? String(row.description) : null,
    dataSource: String(row.data_source ?? "variables").trim() || "variables",
    formatter: row.formatter ? String(row.formatter) : null,
    fallbackValue: row.fallback_value ? String(row.fallback_value) : null,
    isRequired: Boolean(row.is_required),
    isDeprecated: Boolean(row.is_deprecated),
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function applyListFilters(
  values: EmailMacroDefinition[],
  options?: {
    includeInactive?: boolean;
    includeDeprecated?: boolean;
  }
) {
  const includeInactive = Boolean(options?.includeInactive);
  const includeDeprecated = Boolean(options?.includeDeprecated);
  return values.filter((item) => {
    if (!includeInactive && !item.isActive) return false;
    if (!includeDeprecated && item.isDeprecated) return false;
    return true;
  });
}

export function isMissingEmailMacroRegistryTableError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (!message.includes(EMAIL_MACRO_TABLE)) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

export async function listEmailMacroDefinitions(
  supabase: SupabaseClient,
  options?: {
    includeInactive?: boolean;
    includeDeprecated?: boolean;
  }
) {
  const { data, error } = await supabase
    .from(EMAIL_MACRO_TABLE)
    .select(
      "id,macro_key,label,description,data_source,formatter,fallback_value,is_required,is_deprecated,is_active,created_at,updated_at"
    )
    .order("macro_key", { ascending: true });
  if (error) {
    if (isMissingEmailMacroRegistryTableError(error)) {
      return {
        missingTable: true,
        macros: applyListFilters(DEFAULT_EMAIL_MACRO_DEFINITIONS, options),
      };
    }
    throw error;
  }

  const rows = ((data as unknown) as EmailMacroRow[] | null) ?? [];
  const mergedByKey = new Map<string, EmailMacroDefinition>();
  for (const definition of DEFAULT_EMAIL_MACRO_DEFINITIONS) {
    const key = normalizeMacroKey(definition.macroKey).toLowerCase();
    if (!key) continue;
    mergedByKey.set(key, definition);
  }
  for (const row of rows) {
    const normalized = normalizeMacroRow(row);
    const key = normalizeMacroKey(normalized.macroKey).toLowerCase();
    if (!key) continue;
    mergedByKey.set(key, normalized);
  }
  const mergedMacros = Array.from(mergedByKey.values()).sort((a, b) =>
    a.macroKey.localeCompare(b.macroKey)
  );
  return {
    missingTable: false,
    macros: applyListFilters(mergedMacros, options),
  };
}

function normalizeMacroList(values: string[]) {
  return Array.from(
    new Set(values.map((item) => normalizeMacroKey(item)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

function buildDefinitionMap(definitions: EmailMacroDefinition[]) {
  const map = new Map<string, EmailMacroDefinition>();
  for (const definition of definitions) {
    const key = normalizeMacroKey(definition.macroKey);
    if (!key) continue;
    map.set(key.toLowerCase(), definition);
  }
  return map;
}

function findDefinition(
  definitionsByKey: Map<string, EmailMacroDefinition>,
  macroKey: string
) {
  return definitionsByKey.get(normalizeMacroKey(macroKey).toLowerCase()) ?? null;
}

function getPathValue(input: unknown, path: string) {
  if (!path) return undefined;
  const parts = path
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  let cursor: unknown = input;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    const node = cursor as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(node, part)) {
      cursor = node[part];
      continue;
    }
    const lowered = part.toLowerCase();
    const matchedKey = Object.keys(node).find((key) => key.toLowerCase() === lowered);
    cursor = matchedKey ? node[matchedKey] : undefined;
  }
  return cursor;
}

function getVariableValue(
  variables: Record<string, unknown>,
  key: string
) {
  const direct = getPathValue(variables, key);
  if (direct !== undefined && direct !== null) return direct;
  const normalized = key.toLowerCase();
  const matchedKey = Object.keys(variables).find(
    (entry) => entry.toLowerCase() === normalized
  );
  if (!matchedKey) return undefined;
  return variables[matchedKey];
}

function applyFormatter(value: string, formatter: string | null) {
  if (!formatter) return value;
  const rules = formatter
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  let output = value;
  for (const ruleRaw of rules) {
    const rule = ruleRaw.toLowerCase();
    if (rule === "trim") {
      output = output.trim();
      continue;
    }
    if (rule === "upper") {
      output = output.toUpperCase();
      continue;
    }
    if (rule === "lower") {
      output = output.toLowerCase();
      continue;
    }
    if (rule === "capitalize") {
      output =
        output.length > 0
          ? `${output.charAt(0).toUpperCase()}${output.slice(1)}`
          : output;
    }
  }
  return output;
}

function resolveMacroValue(
  macroKey: string,
  definition: EmailMacroDefinition | null,
  context: ResolveMacroContext
) {
  const variables = context.variables ?? {};
  const extra = context.context ?? {};

  const dataSource = String(definition?.dataSource ?? "").trim();
  let raw: unknown;

  if (!dataSource || dataSource === "auto") {
    raw = getVariableValue(variables, macroKey);
  } else if (dataSource === "variables") {
    raw = getVariableValue(variables, macroKey);
  } else if (dataSource.startsWith("variables.")) {
    raw = getPathValue(variables, dataSource.slice("variables.".length));
  } else if (dataSource === "context") {
    raw = getPathValue(extra, macroKey);
  } else if (dataSource.startsWith("context.")) {
    raw = getPathValue(extra, dataSource.slice("context.".length));
  } else if (dataSource.startsWith("static:")) {
    raw = dataSource.slice("static:".length);
  } else {
    raw = getPathValue(variables, dataSource);
    if (raw === undefined || raw === null) {
      raw = getPathValue(extra, dataSource);
    }
  }

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    const direct = getVariableValue(variables, macroKey);
    raw = direct ?? raw;
  }
  if ((raw === undefined || raw === null || String(raw).trim() === "") && definition?.fallbackValue) {
    raw = definition.fallbackValue;
  }

  const value = raw === undefined || raw === null ? "" : String(raw);
  return applyFormatter(value, definition?.formatter ?? null);
}

export function validateTemplateMacroUsage(input: {
  subjectTemplate: string;
  bodyTemplate: string;
  existingMacros?: string[];
  definitions: EmailMacroDefinition[];
}) {
  const detectedMacros = normalizeMacroList([
    ...collectMacros(`${input.subjectTemplate || ""}\n${input.bodyTemplate || ""}`),
    ...(input.existingMacros ?? []),
  ]);
  const definitionsByKey = buildDefinitionMap(input.definitions);
  const unknownMacros = detectedMacros.filter(
    (key) => !findDefinition(definitionsByKey, key)
  );
  const deprecatedMacros = detectedMacros.filter((key) => {
    const definition = findDefinition(definitionsByKey, key);
    return Boolean(definition?.isDeprecated);
  });

  return {
    detectedMacros,
    unknownMacros,
    deprecatedMacros,
  } satisfies TemplateMacroValidation;
}

export function resolveTemplateMacros(input: {
  subjectTemplate: string;
  bodyTemplate: string;
  existingMacros?: string[];
  definitions: EmailMacroDefinition[];
  variables?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  const validation = validateTemplateMacroUsage({
    subjectTemplate: input.subjectTemplate,
    bodyTemplate: input.bodyTemplate,
    existingMacros: input.existingMacros,
    definitions: input.definitions,
  });

  const definitionsByKey = buildDefinitionMap(input.definitions);
  const values: Record<string, string> = {};
  const missingRequiredMacros: string[] = [];

  for (const macroKey of validation.detectedMacros) {
    const definition = findDefinition(definitionsByKey, macroKey);
    const value = resolveMacroValue(macroKey, definition, {
      variables: input.variables ?? {},
      context: input.context ?? {},
    });
    values[macroKey] = value;

    if (definition?.isRequired && definition.isActive && !definition.isDeprecated && !String(value).trim()) {
      missingRequiredMacros.push(macroKey);
    }
  }

  return {
    detectedMacros: validation.detectedMacros,
    unknownMacros: validation.unknownMacros,
    deprecatedMacros: validation.deprecatedMacros,
    missingRequiredMacros: normalizeMacroList(missingRequiredMacros),
    values,
  } satisfies ResolvedTemplateMacros;
}
