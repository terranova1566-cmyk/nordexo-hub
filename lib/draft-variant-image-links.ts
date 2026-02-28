import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

const normalizeRelativePath = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

const normalizeFolderToken = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripDraftPrefixParts = (parts: string[]) => {
  if (
    parts.length >= 2 &&
    parts[0].toLowerCase() === "images" &&
    parts[1].toLowerCase() === "draft_products"
  ) {
    return parts.slice(2);
  }
  return parts;
};

const isImageFileName = (value: string) => {
  const ext = path.extname(String(value || "")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};

export const extractDraftVariantImageFileName = (value: unknown) => {
  const input = String(value ?? "").trim();
  if (!input) return "";
  let candidate = input;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname;
    } catch {
      // Fall back to plain path parsing.
    }
  }
  candidate = candidate.replace(/\\/g, "/");
  const withoutQuery = candidate.split("?")[0]?.split("#")[0] ?? candidate;
  const decoded = safeDecode(withoutQuery);
  return safeDecode(path.posix.basename(decoded)).trim();
};

const normalizeFileNameKey = (value: string) =>
  safeDecode(String(value || ""))
    .trim()
    .toLowerCase();

const parseDraftImageContext = (relativePathRaw: string) => {
  const normalizedPath = normalizeRelativePath(relativePathRaw);
  if (!normalizedPath) return null;
  const parts = stripDraftPrefixParts(
    normalizedPath.split("/").map((part) => safeDecode(part)).filter(Boolean)
  );
  if (parts.length < 3) return null;
  const spu = String(parts[1] || "").trim().toUpperCase();
  if (!spu) return null;
  const fileName = String(parts[parts.length - 1] || "").trim();
  if (!fileName || fileName.startsWith(".") || !isImageFileName(fileName)) {
    return null;
  }
  const fileNameKey = normalizeFileNameKey(fileName);
  if (!fileNameKey) return null;
  const isDeletedPath = parts.some(
    (part) => normalizeFolderToken(part) === "deleted images"
  );
  return {
    normalizedPath,
    spu,
    fileName,
    fileNameKey,
    isDeletedPath,
  };
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
};

export const createDraftAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const clearDraftVariantImageLinksForRemovedImage = async (input: {
  relativePath: string;
  adminClient?: SupabaseClient;
}) => {
  const context = parseDraftImageContext(input.relativePath);
  if (!context) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: "",
      fileName: "",
    };
  }
  if (context.isDeletedPath) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: context.spu,
      fileName: context.fileName,
    };
  }

  const adminClient = input.adminClient ?? createDraftAdminClient();
  if (!adminClient) {
    throw new Error("Server is missing Supabase credentials.");
  }

  const { data, error } = await adminClient
    .from("draft_variants")
    .select("id,draft_variant_image_url")
    .eq("draft_spu", context.spu)
    .not("draft_variant_image_url", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const variantIds = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const currentFileName = extractDraftVariantImageFileName(
        row.draft_variant_image_url
      );
      return normalizeFileNameKey(currentFileName) === context.fileNameKey;
    })
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);

  if (variantIds.length === 0) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: context.spu,
      fileName: context.fileName,
    };
  }

  const now = new Date().toISOString();
  for (const ids of chunk(variantIds, 200)) {
    const { error: updateError } = await adminClient
      .from("draft_variants")
      .update({
        draft_variant_image_url: null,
        draft_updated_at: now,
      })
      .in("id", ids);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    clearedCount: variantIds.length,
    variantIds,
    spu: context.spu,
    fileName: context.fileName,
  };
};

export const clearDraftVariantImageLinksForMovedImage = async (input: {
  sourcePath: string;
  destinationPath: string;
  adminClient?: SupabaseClient;
}) => {
  const sourceContext = parseDraftImageContext(input.sourcePath);
  if (!sourceContext) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: "",
      fileName: "",
      preserved: false,
    };
  }
  if (sourceContext.isDeletedPath) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: sourceContext.spu,
      fileName: sourceContext.fileName,
      preserved: false,
    };
  }

  const destinationContext = parseDraftImageContext(input.destinationPath);
  const preserveLink =
    Boolean(destinationContext) &&
    destinationContext!.spu === sourceContext.spu &&
    destinationContext!.fileNameKey === sourceContext.fileNameKey &&
    !destinationContext!.isDeletedPath;

  if (preserveLink) {
    return {
      clearedCount: 0,
      variantIds: [] as string[],
      spu: sourceContext.spu,
      fileName: sourceContext.fileName,
      preserved: true,
    };
  }

  const cleared = await clearDraftVariantImageLinksForRemovedImage({
    relativePath: input.sourcePath,
    adminClient: input.adminClient,
  });

  return {
    ...cleared,
    preserved: false,
  };
};

export const repointDraftVariantImageLinksForMovedImage = async (input: {
  sourcePath: string;
  destinationPath: string;
  adminClient?: SupabaseClient;
}) => {
  const sourceContext = parseDraftImageContext(input.sourcePath);
  const destinationContext = parseDraftImageContext(input.destinationPath);
  if (!sourceContext || !destinationContext) {
    return {
      updatedCount: 0,
      variantIds: [] as string[],
      spu: "",
      fromFileName: "",
      toFileName: "",
    };
  }
  if (sourceContext.isDeletedPath) {
    return {
      updatedCount: 0,
      variantIds: [] as string[],
      spu: sourceContext.spu,
      fromFileName: sourceContext.fileName,
      toFileName: destinationContext.fileName,
    };
  }
  if (
    sourceContext.spu !== destinationContext.spu ||
    sourceContext.fileNameKey === destinationContext.fileNameKey ||
    destinationContext.isDeletedPath
  ) {
    return {
      updatedCount: 0,
      variantIds: [] as string[],
      spu: sourceContext.spu,
      fromFileName: sourceContext.fileName,
      toFileName: destinationContext.fileName,
    };
  }

  const adminClient = input.adminClient ?? createDraftAdminClient();
  if (!adminClient) {
    throw new Error("Server is missing Supabase credentials.");
  }

  const { data, error } = await adminClient
    .from("draft_variants")
    .select("id,draft_variant_image_url")
    .eq("draft_spu", sourceContext.spu)
    .not("draft_variant_image_url", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const variantIds = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const currentFileName = extractDraftVariantImageFileName(
        row.draft_variant_image_url
      );
      return normalizeFileNameKey(currentFileName) === sourceContext.fileNameKey;
    })
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);

  if (variantIds.length === 0) {
    return {
      updatedCount: 0,
      variantIds: [] as string[],
      spu: sourceContext.spu,
      fromFileName: sourceContext.fileName,
      toFileName: destinationContext.fileName,
    };
  }

  const now = new Date().toISOString();
  for (const ids of chunk(variantIds, 200)) {
    const { error: updateError } = await adminClient
      .from("draft_variants")
      .update({
        draft_variant_image_url: destinationContext.fileName,
        draft_updated_at: now,
      })
      .in("id", ids);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    updatedCount: variantIds.length,
    variantIds,
    spu: sourceContext.spu,
    fromFileName: sourceContext.fileName,
    toFileName: destinationContext.fileName,
  };
};
