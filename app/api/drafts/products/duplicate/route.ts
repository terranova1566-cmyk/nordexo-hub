import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";
import { isImageFileName } from "@/lib/image-names";

export const runtime = "nodejs";

const BIGINT_ID_RE = /^\d+$/;
const DRAFT_IMAGE_FOLDER_PREFIX = "images/draft_products/";

const getAdminClient = () => {
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

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const normalizeDraftId = (value: unknown) => {
  const text = String(value ?? "").trim();
  return BIGINT_ID_RE.test(text) ? text : null;
};

const normalizeSpu = (value: unknown) => String(value ?? "").trim();

const normalizeDraftFolderRelative = (value: unknown) => {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!trimmed) return "";
  if (trimmed.startsWith(DRAFT_IMAGE_FOLDER_PREFIX)) {
    return trimmed.slice(DRAFT_IMAGE_FOLDER_PREFIX.length);
  }
  return trimmed;
};

const isWithinDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const parseRunFromDraftImageFolder = (folder: string) => {
  const relative = normalizeDraftFolderRelative(folder);
  if (!relative) return null;
  const [run = ""] = relative.split("/").map((part) => part.trim());
  if (!run || run === "." || run === "..") return null;
  if (run.includes("/") || run.includes("\\") || run.includes("..")) return null;
  return run;
};

const formatDraftImageFolderLikeSource = (
  sourceFolder: string,
  run: string,
  targetSpu: string
) => {
  const nextRelative = `${run}/${targetSpu}`;
  if (String(sourceFolder || "").trim().startsWith(DRAFT_IMAGE_FOLDER_PREFIX)) {
    return `${DRAFT_IMAGE_FOLDER_PREFIX}${nextRelative}`;
  }
  return nextRelative;
};

const rewriteSpuPrefix = (value: string, sourceSpu: string, targetSpu: string) => {
  const raw = String(value ?? "");
  if (!raw) return raw;
  const sourceUpper = sourceSpu.toUpperCase();
  const normalized = raw.trim();
  const normalizedUpper = normalized.toUpperCase();
  if (normalizedUpper === sourceUpper) return targetSpu;
  if (normalizedUpper.startsWith(`${sourceUpper}-`)) {
    return `${targetSpu}${normalized.slice(sourceSpu.length)}`;
  }
  return raw;
};

const rewriteSpuPrefixInPathLike = (
  value: unknown,
  sourceSpu: string,
  targetSpu: string
) => {
  if (typeof value !== "string") return value;
  const exact = rewriteSpuPrefix(value, sourceSpu, targetSpu);
  if (exact !== value) return exact;
  const raw = String(value ?? "");
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const lastIndex = parts.length - 1;
  if (lastIndex < 0) return value;
  const rewrittenBase = rewriteSpuPrefix(parts[lastIndex], sourceSpu, targetSpu);
  if (rewrittenBase === parts[lastIndex]) return value;
  parts[lastIndex] = rewrittenBase;
  return parts.join("/");
};

const rewriteStringArray = (value: unknown, sourceSpu: string, targetSpu: string) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) =>
    typeof item === "string" ? rewriteSpuPrefixInPathLike(item, sourceSpu, targetSpu) : item
  );
};

const rewriteSkuForClone = (value: unknown, sourceSpu: string, targetSpu: string) => {
  if (typeof value !== "string") return value;
  return rewriteSpuPrefix(value, sourceSpu, targetSpu);
};

const rewriteRawRowIdentifiers = (
  value: unknown,
  sourceSpu: string,
  targetSpu: string,
  sourceSku?: string,
  targetSku?: string
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const next = { ...(value as Record<string, unknown>) };

  ["spu", "SPU", "draft_spu"].forEach((key) => {
    const current = next[key];
    if (typeof current !== "string") return;
    next[key] = rewriteSpuPrefix(current, sourceSpu, targetSpu);
  });

  ["sku", "SKU", "draft_sku"].forEach((key) => {
    const current = next[key];
    if (typeof current !== "string") return;
    if (sourceSku && targetSku && current.trim().toUpperCase() === sourceSku.toUpperCase()) {
      next[key] = targetSku;
      return;
    }
    next[key] = rewriteSpuPrefix(current, sourceSpu, targetSpu);
  });

  return next;
};

const buildTempName = (name: string, index: number) => {
  const ext = path.extname(name);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `.__nordexo_clone_tmp_${stamp}_${rand}_${index}${ext}`;
};

const renameTopLevelSpuImagePrefixes = async (
  folderAbsolutePath: string,
  sourceSpu: string,
  targetSpu: string
) => {
  const entries = await fs.readdir(folderAbsolutePath, { withFileTypes: true });
  const sourceSpuUpper = sourceSpu.toUpperCase();
  const plan = entries
    .filter((entry) => entry.isFile() && isImageFileName(entry.name))
    .filter((entry) => entry.name.toUpperCase().startsWith(`${sourceSpuUpper}-`))
    .map((entry) => ({
      sourceName: entry.name,
      targetName: `${targetSpu}${entry.name.slice(sourceSpu.length)}`,
    }))
    .filter((entry) => entry.sourceName !== entry.targetName);

  if (plan.length === 0) return;

  const existingNames = new Set(entries.map((entry) => entry.name));
  const sourceNames = new Set(plan.map((entry) => entry.sourceName));
  for (const entry of plan) {
    if (existingNames.has(entry.targetName) && !sourceNames.has(entry.targetName)) {
      throw new Error(
        `Cannot rename image ${entry.sourceName} to ${entry.targetName}: target already exists.`
      );
    }
  }

  const staged: Array<{ tempName: string; targetName: string }> = [];
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const tempName = buildTempName(item.sourceName, index);
    await fs.rename(
      path.join(folderAbsolutePath, item.sourceName),
      path.join(folderAbsolutePath, tempName)
    );
    staged.push({ tempName, targetName: item.targetName });
  }
  for (const item of staged) {
    await fs.rename(
      path.join(folderAbsolutePath, item.tempName),
      path.join(folderAbsolutePath, item.targetName)
    );
  }
};

const updateSpuPoolRows = async (
  adminClient: AdminClient,
  spus: string[],
  values: Record<string, unknown>
) => {
  if (spus.length === 0) return;
  const chunkSize = 150;
  for (let index = 0; index < spus.length; index += chunkSize) {
    const chunk = spus.slice(index, index + chunkSize);
    const { error } = await adminClient
      .from("production_spu_pool")
      .update(values)
      .in("spu", chunk);
    if (error) {
      throw new Error(error.message);
    }
  }
};

const claimFreeSpus = async (adminClient: AdminClient, count: number) => {
  if (count <= 0) return [] as string[];
  const claimLogSource = "draft_explorer_duplicate_product";
  const claimed: string[] = [];
  const attempted = new Set<string>();

  while (claimed.length < count) {
    const remaining = count - claimed.length;
    const fetchLimit = Math.max(remaining * 4, remaining + 10);
    const { data: candidates, error } = await adminClient
      .from("production_spu_pool")
      .select("spu")
      .eq("status", "free")
      .order("spu", { ascending: true })
      .limit(fetchLimit);

    if (error) {
      throw new Error(error.message);
    }

    const available = Array.isArray(candidates)
      ? candidates
          .map((row) => normalizeSpu((row as Record<string, unknown>).spu))
          .filter((value) => Boolean(value))
          .filter((value) => !attempted.has(value))
      : [];

    if (available.length === 0) {
      break;
    }

    for (const candidateSpu of available) {
      attempted.add(candidateSpu);
      const { data: updated, error: updateError } = await adminClient
        .from("production_spu_pool")
        .update({
          status: "used",
          used_source: claimLogSource,
          used_at: new Date().toISOString(),
        })
        .eq("spu", candidateSpu)
        .eq("status", "free")
        .select("spu")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message);
      }
      if (!updated?.spu) {
        continue;
      }
      claimed.push(candidateSpu);
      if (claimed.length >= count) break;
    }
  }

  if (claimed.length < count) {
    await updateSpuPoolRows(adminClient, claimed, {
      status: "free",
      used_source: null,
      used_at: null,
    });
    throw new Error("Not enough free SPUs available.");
  }

  return claimed;
};

const releaseClaimedSpus = async (adminClient: AdminClient, claimedSpus: string[]) => {
  if (claimedSpus.length === 0) return;
  await updateSpuPoolRows(adminClient, claimedSpus, {
    status: "free",
    used_source: null,
    used_at: null,
  });
};

const chunkArray = <T,>(value: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
};

const rollbackClones = async (
  adminClient: AdminClient,
  clonedSpus: string[],
  createdFolders: string[]
) => {
  for (const absolutePath of createdFolders) {
    if (!isWithinDraftRoot(absolutePath)) continue;
    await fs.rm(absolutePath, { recursive: true, force: true });
  }

  if (clonedSpus.length === 0) return;

  const chunks = chunkArray(clonedSpus, 150);
  for (const chunk of chunks) {
    const { error: variantDeleteError } = await adminClient
      .from("draft_variants")
      .delete()
      .in("draft_spu", chunk);
    if (variantDeleteError) {
      throw new Error(variantDeleteError.message);
    }
  }

  for (const chunk of chunks) {
    const { error: productDeleteError } = await adminClient
      .from("draft_products")
      .delete()
      .in("draft_spu", chunk);
    if (productDeleteError) {
      throw new Error(productDeleteError.message);
    }
  }
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { ids?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const rawIds = Array.isArray(payload?.ids)
    ? payload.ids.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const invalidIds = rawIds.filter((value) => !BIGINT_ID_RE.test(value));
  const ids = Array.from(
    new Set(
      rawIds
        .map((value) => normalizeDraftId(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids." }, { status: 400 });
  }
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Invalid product id(s): ${invalidIds.slice(0, 3).join(", ")}` },
      { status: 400 }
    );
  }

  const { data: sourceProducts, error: sourceProductError } = await adminClient
    .from("draft_products")
    .select("*")
    .in("id", ids)
    .eq("draft_status", "draft");

  if (sourceProductError) {
    return NextResponse.json({ error: sourceProductError.message }, { status: 500 });
  }
  if (!sourceProducts || sourceProducts.length === 0) {
    return NextResponse.json({ error: "No products found." }, { status: 404 });
  }

  const productsById = new Map<string, Record<string, unknown>>();
  sourceProducts.forEach((row) => {
    const id = normalizeDraftId((row as Record<string, unknown>).id);
    if (!id) return;
    productsById.set(id, row as Record<string, unknown>);
  });

  const missingIds = ids.filter((id) => !productsById.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: `Product rows not found: ${missingIds.slice(0, 3).join(", ")}` },
      { status: 404 }
    );
  }

  const orderedSourceProducts = ids
    .map((id) => productsById.get(id))
    .filter((row): row is Record<string, unknown> => Boolean(row));

  const sourceSpus = Array.from(
    new Set(
      orderedSourceProducts
        .map((row) => normalizeSpu(row.draft_spu))
        .filter((value): value is string => Boolean(value))
    )
  );

  let sourceVariants: Record<string, unknown>[] = [];
  if (sourceSpus.length > 0) {
    const { data, error: sourceVariantsError } = await adminClient
      .from("draft_variants")
      .select("*")
      .in("draft_spu", sourceSpus);

    if (sourceVariantsError) {
      return NextResponse.json({ error: sourceVariantsError.message }, { status: 500 });
    }
    sourceVariants = (data ?? []) as Record<string, unknown>[];
  }

  const sourceVariantsBySpu = new Map<string, Record<string, unknown>[]>();
  sourceVariants.forEach((value) => {
    const spu = normalizeSpu(value.draft_spu);
    if (!spu) return;
    const list = sourceVariantsBySpu.get(spu) ?? [];
    list.push(value);
    sourceVariantsBySpu.set(spu, list);
  });

  const claimedSpus: string[] = [];
  const clonedSpus: string[] = [];
  const createdFolders: string[] = [];
  const createdItems: Array<{
    source_id: string;
    source_spu: string;
    target_spu: string;
    target_id: string | null;
    run: string;
  }> = [];

  try {
    const claimed = await claimFreeSpus(adminClient, orderedSourceProducts.length);
    claimedSpus.push(...claimed);

    for (let index = 0; index < orderedSourceProducts.length; index += 1) {
      const sourceRow = orderedSourceProducts[index];
      const sourceId = normalizeDraftId(sourceRow.id);
      const sourceSpu = normalizeSpu(sourceRow.draft_spu);
      const sourceFolder = String(sourceRow.draft_image_folder ?? "").trim();
      const targetSpu = claimedSpus[index];

      if (!sourceId || !sourceSpu) {
        throw new Error("Source product is missing required identifiers.");
      }
      if (!targetSpu) {
        throw new Error("Unable to reserve target SPU.");
      }

      const run = parseRunFromDraftImageFolder(sourceFolder);
      if (!run) {
        throw new Error(`Unable to determine draft run for SPU ${sourceSpu}.`);
      }

      const sourceProductRelativePath = `${run}/${sourceSpu}`;
      const sourceProductAbsolutePath = resolveDraftPath(sourceProductRelativePath);
      if (!sourceProductAbsolutePath || !isWithinDraftRoot(sourceProductAbsolutePath)) {
        throw new Error(`Invalid source folder path for SPU ${sourceSpu}.`);
      }

      const sourceStat = await fs.stat(sourceProductAbsolutePath).catch(() => null);
      if (!sourceStat || !sourceStat.isDirectory()) {
        throw new Error(`Source folder does not exist for SPU ${sourceSpu}.`);
      }

      const targetProductRelativePath = `${run}/${targetSpu}`;
      const targetProductAbsolutePath = resolveDraftPath(targetProductRelativePath);
      if (!targetProductAbsolutePath || !isWithinDraftRoot(targetProductAbsolutePath)) {
        throw new Error(`Invalid target folder path for SPU ${targetSpu}.`);
      }

      const targetExists = await fs.stat(targetProductAbsolutePath).catch(() => null);
      if (targetExists) {
        throw new Error(`Target folder already exists for SPU ${targetSpu}.`);
      }

      await fs.mkdir(path.dirname(targetProductAbsolutePath), { recursive: true });
      await fs.cp(sourceProductAbsolutePath, targetProductAbsolutePath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      createdFolders.push(targetProductAbsolutePath);

      await renameTopLevelSpuImagePrefixes(
        targetProductAbsolutePath,
        sourceSpu,
        targetSpu
      );

      const nowIso = new Date().toISOString();
      const productClone: Record<string, unknown> = { ...sourceRow };
      delete productClone.id;
      productClone.draft_spu = targetSpu;
      productClone.draft_status = sourceRow.draft_status ?? "draft";
      productClone.draft_updated_at = nowIso;
      productClone.draft_created_at = nowIso;
      productClone.draft_image_folder = formatDraftImageFolderLikeSource(
        sourceFolder,
        run,
        targetSpu
      );
      productClone.draft_main_image_url = rewriteSpuPrefixInPathLike(
        sourceRow.draft_main_image_url,
        sourceSpu,
        targetSpu
      );
      productClone.draft_image_urls = rewriteStringArray(
        sourceRow.draft_image_urls,
        sourceSpu,
        targetSpu
      );
      productClone.draft_variant_image_urls = rewriteStringArray(
        sourceRow.draft_variant_image_urls,
        sourceSpu,
        targetSpu
      );
      productClone.draft_image_files = rewriteStringArray(
        sourceRow.draft_image_files,
        sourceSpu,
        targetSpu
      );
      productClone.draft_variant_image_files = rewriteStringArray(
        sourceRow.draft_variant_image_files,
        sourceSpu,
        targetSpu
      );
      productClone.draft_raw_row = rewriteRawRowIdentifiers(
        sourceRow.draft_raw_row,
        sourceSpu,
        targetSpu
      );

      const { data: insertedProduct, error: insertProductError } = await adminClient
        .from("draft_products")
        .insert(productClone)
        .select("id,draft_spu")
        .maybeSingle();

      if (insertProductError) {
        throw new Error(insertProductError.message);
      }

      clonedSpus.push(targetSpu);

      const sourceSpuVariants = sourceVariantsBySpu.get(sourceSpu) ?? [];
      if (sourceSpuVariants.length > 0) {
        const variantInserts = sourceSpuVariants.map((variant) => {
          const oldSku = String(variant.draft_sku ?? "").trim();
          const rewrittenSkuRaw = rewriteSkuForClone(oldSku, sourceSpu, targetSpu);
          const rewrittenSku = String(rewrittenSkuRaw ?? "").trim();
          const next: Record<string, unknown> = { ...variant };
          delete next.id;
          next.draft_spu = targetSpu;
          next.draft_status = variant.draft_status ?? "draft";
          next.draft_updated_at = nowIso;
          next.draft_created_at = nowIso;
          next.draft_sku = rewrittenSku || null;
          next.draft_variant_image_url = rewriteSpuPrefixInPathLike(
            variant.draft_variant_image_url,
            sourceSpu,
            targetSpu
          );
          next.draft_raw_row = rewriteRawRowIdentifiers(
            variant.draft_raw_row,
            sourceSpu,
            targetSpu,
            oldSku,
            rewrittenSku
          );
          return next;
        });

        const chunks = chunkArray(variantInserts, 150);
        for (const chunk of chunks) {
          const { error: insertVariantError } = await adminClient
            .from("draft_variants")
            .insert(chunk);
          if (insertVariantError) {
            throw new Error(insertVariantError.message);
          }
        }
      }

      createdItems.push({
        source_id: sourceId,
        source_spu: sourceSpu,
        target_spu: targetSpu,
        target_id: insertedProduct?.id ? String(insertedProduct.id) : null,
        run,
      });
    }

    return NextResponse.json({
      ok: true,
      duplicated: createdItems.length,
      items: createdItems,
    });
  } catch (error) {
    try {
      await rollbackClones(adminClient, clonedSpus, createdFolders);
    } catch (rollbackError) {
      console.error("Unable to rollback product clone:", rollbackError);
    }

    try {
      await releaseClaimedSpus(adminClient, claimedSpus);
    } catch (releaseError) {
      console.error("Unable to release claimed SPUs:", releaseError);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to duplicate products.",
      },
      { status: 500 }
    );
  }
}
