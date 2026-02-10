"use client";

import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  MessageBar,
  Option,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

type BatchItem = {
  product_id: string;
  position: number | null;
  done_at: string | null;
  product: {
    id: string;
    spu: string | null;
    title: string | null;
    image_folder: string | null;
    updated_at: string | null;
    created_at: string | null;
  } | null;
};

type ProductResponse = {
  product: any;
  variants: any[];
  image_urls: string[];
  thumbnail_urls: string[];
  original_urls: string[];
};

type RoleRow = {
  filename: string;
  role: string;
  updated_at?: string | null;
};

type LegacyTagRow = {
  filename: string;
  decision_tags: string[] | null;
  checked_at?: string | null;
  decision?: string | null;
};

type ImagesMetaResponse = {
  roles: RoleRow[];
  legacy_tags: LegacyTagRow[];
  spu: string | null;
};

type CachedBundle = {
  product: ProductResponse;
  meta: ImagesMetaResponse;
};

type BaseState = {
  mainFilename: string | null;
  envFilenames: Set<string>;
  variantTagFilenames: Set<string>;
  colorByKey: Record<string, string | null>;
};

type ColorGroup = {
  key: string;
  label: string;
  variantIds: string[];
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  headerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "10px",
  },
  subtle: {
    color: tokens.colorNeutralForeground3,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  toolbarRight: {
    marginLeft: "auto",
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
  },
  gallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "12px",
  },
  tile: {
    borderRadius: "14px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tilePendingMain: {
    border: "2px solid #107c10",
  },
  tilePendingDelete: {
    border: "2px solid #d13438",
    boxShadow: "0 0 0 2px rgba(209,52,56,0.15)",
  },
  tileImg: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
  },
  tileMeta: {
    padding: "10px 10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  tileBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
  },
  filename: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-word",
  },
  variantText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase100,
  },
  tileActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    paddingTop: "2px",
  },
  actionDeleteActive: {
    backgroundColor: "#ffe5e5",
    border: "1px solid #d13438",
    color: "#a4262c",
  },
  actionMainActive: {
    backgroundColor: "#dff6dd",
    border: "1px solid #107c10",
    color: "#0b5a0b",
  },
  actionEnvActive: {
    backgroundColor: "#dbeeff",
    border: "1px solid #3b79ff",
    color: "#1a4aa5",
  },
  actionVariantActive: {
    backgroundColor: "#fff1c2",
    border: "1px solid #c19c00",
    color: "#7a5f00",
  },
  productCard: {
    padding: "12px 14px 14px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
});

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function getFilenameFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const raw = String(url);
  const idx = raw.lastIndexOf("/");
  if (idx < 0) return null;
  const candidate = raw.slice(idx + 1).trim();
  return candidate || null;
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function recordsEqual(
  a: Record<string, string | null>,
  b: Record<string, string | null>
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  }
  return true;
}

function pickCurrentMain(
  rolesByFilename: Map<string, Set<string>>,
  legacyTagsByFilename: Map<string, Set<string>>,
  filenames: string[]
) {
  for (const name of filenames) {
    if (rolesByFilename.get(name)?.has("main")) return name;
  }
  for (const name of filenames) {
    if (name.toLowerCase().includes("main")) return name;
  }
  return null;
}

function buildTagMap(rows: Array<{ filename: string; role?: string; decision_tags?: string[] | null }>) {
  const map = new Map<string, Set<string>>();
  rows.forEach((row: any) => {
    const filename = row?.filename ? String(row.filename) : "";
    if (!filename) return;
    const entry = map.get(filename) ?? new Set<string>();
    if (typeof row?.role === "string" && row.role.trim()) {
      entry.add(String(row.role).trim().toLowerCase());
    }
    if (Array.isArray(row?.decision_tags)) {
      row.decision_tags.forEach((tag: any) => {
        if (!tag) return;
        entry.add(String(tag).trim().toLowerCase());
      });
    }
    map.set(filename, entry);
  });
  return map;
}

function detectVariantColorLabel(variant: any) {
  const raw =
    (variant?.variation_color_se ? String(variant.variation_color_se) : "") ||
    (variant?.option2 ? String(variant.option2) : "") ||
    (variant?.option1 ? String(variant.option1) : "");
  const label = raw.trim();
  return label ? label : null;
}

function computeColorGroups(variants: any[]): ColorGroup[] {
  const byKey = new Map<string, ColorGroup>();
  for (const variant of variants ?? []) {
    const label = detectVariantColorLabel(variant);
    if (!label) continue;
    const key = normalizeKey(label);
    const entry = byKey.get(key) ?? { key, label, variantIds: [] };
    const variantId = variant?.id ? String(variant.id) : "";
    if (variantId) entry.variantIds.push(variantId);
    byKey.set(key, entry);
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "sv", { sensitivity: "base" })
  );
}

function computeColorAssignments(
  variants: any[],
  colorGroups: ColorGroup[]
): Record<string, string | null> {
  const idsToColorKey = new Map<string, string>();
  colorGroups.forEach((group) => {
    group.variantIds.forEach((id) => idsToColorKey.set(id, group.key));
  });

  const filenamesByColorKey = new Map<string, Set<string>>();
  for (const variant of variants ?? []) {
    const variantId = variant?.id ? String(variant.id) : "";
    const colorKey = variantId ? idsToColorKey.get(variantId) ?? null : null;
    if (!colorKey) continue;
    const filename = getFilenameFromUrl(variant?.variant_image_url);
    if (!filename) continue;
    const set = filenamesByColorKey.get(colorKey) ?? new Set<string>();
    set.add(filename);
    filenamesByColorKey.set(colorKey, set);
  }

  const out: Record<string, string | null> = {};
  colorGroups.forEach((group) => {
    const names = filenamesByColorKey.get(group.key) ?? new Set<string>();
    if (names.size === 1) {
      out[group.key] = Array.from(names)[0];
      return;
    }
    out[group.key] = null;
  });

  return out;
}

function invertAssignments(assignments: Record<string, string | null>) {
  const byFilename = new Map<string, string[]>();
  for (const [key, filename] of Object.entries(assignments)) {
    if (!filename) continue;
    const list = byFilename.get(filename) ?? [];
    list.push(key);
    byFilename.set(filename, list);
  }
  return byFilename;
}

function preloadImages(urls: string[]) {
  for (const url of urls) {
    try {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = url;
    } catch {
      // ignore
    }
  }
}

export default function BatchImageEditorEditPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const batchId = typeof params?.batchId === "string" ? params.batchId : "";

  const cacheRef = useRef<Map<string, CachedBundle>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set());
  const baseRef = useRef<BaseState | null>(null);

  const [batchName, setBatchName] = useState<string>("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentItem = items[currentIndex] ?? null;

  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [productData, setProductData] = useState<ProductResponse | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [legacyTags, setLegacyTags] = useState<LegacyTagRow[]>([]);

  const [draftDeletes, setDraftDeletes] = useState<Set<string>>(() => new Set());
  const [draftMain, setDraftMain] = useState<string | null>(null);
  const [draftEnv, setDraftEnv] = useState<Set<string>>(() => new Set());
  const [draftVariantTag, setDraftVariantTag] = useState<Set<string>>(() => new Set());
  const [draftColorByKey, setDraftColorByKey] = useState<Record<string, string | null>>({});

  const [status, setStatus] = useState<{
    intent: "success" | "error";
    text: string;
  } | null>(null);

  const imageUrls = useMemo(() => {
    if (!productData) return [];
    const thumbs = Array.isArray(productData.thumbnail_urls)
      ? productData.thumbnail_urls
      : [];
    const standard = Array.isArray(productData.image_urls)
      ? productData.image_urls
      : [];
    return thumbs.length ? thumbs : standard;
  }, [productData]);

  const filenames = useMemo(() => {
    const out: string[] = [];
    imageUrls.forEach((url) => {
      const name = getFilenameFromUrl(url);
      if (!name) return;
      out.push(name);
    });
    return out;
  }, [imageUrls]);

  const rolesByFilename = useMemo(() => buildTagMap(roles as any), [roles]);
  const legacyTagsByFilename = useMemo(
    () => buildTagMap(legacyTags as any),
    [legacyTags]
  );

  const colorGroups = useMemo(
    () => computeColorGroups(productData?.variants ?? []),
    [productData?.variants]
  );

  const currentColorByKey = useMemo(
    () => computeColorAssignments(productData?.variants ?? [], colorGroups),
    [productData?.variants, colorGroups]
  );

  const colorByFilename = useMemo(
    () => invertAssignments(draftColorByKey),
    [draftColorByKey]
  );

  const colorLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    colorGroups.forEach((group) => map.set(group.key, group.label));
    return map;
  }, [colorGroups]);

  const variantSkusByFilename = useMemo(() => {
    const map = new Map<string, string[]>();
    const variants = productData?.variants ?? [];
    for (const v of variants) {
      const filename = getFilenameFromUrl(v?.variant_image_url);
      if (!filename) continue;
      const sku = v?.sku ? String(v.sku) : "";
      if (!sku) continue;
      const list = map.get(filename) ?? [];
      list.push(sku);
      map.set(filename, list);
    }
    return map;
  }, [productData?.variants]);

  const hasUnsavedChanges = useMemo(() => {
    const base = baseRef.current;
    if (!base) return false;
    if (draftDeletes.size > 0) return true;
    if ((draftMain ?? null) !== (base.mainFilename ?? null)) return true;
    if (!setsEqual(draftEnv, base.envFilenames)) return true;
    if (!setsEqual(draftVariantTag, base.variantTagFilenames)) return true;
    if (!recordsEqual(draftColorByKey, base.colorByKey)) return true;
    return false;
  }, [draftDeletes, draftMain, draftEnv, draftVariantTag, draftColorByKey]);

  const applyBundle = (bundle: CachedBundle) => {
    setProductData(bundle.product);
    setRoles(Array.isArray(bundle.meta?.roles) ? bundle.meta.roles : []);
    setLegacyTags(Array.isArray(bundle.meta?.legacy_tags) ? bundle.meta.legacy_tags : []);
    setProductError(null);
    setStatus(null);

    const bundleImageUrls = Array.isArray(bundle.product?.thumbnail_urls)
      ? bundle.product.thumbnail_urls
      : Array.isArray(bundle.product?.image_urls)
        ? bundle.product.image_urls
        : [];
    const bundleFilenames = bundleImageUrls
      .map((url) => getFilenameFromUrl(url))
      .filter(Boolean) as string[];

    // Base state for change detection + pre-filled UI.
    const nextRolesByFilename = buildTagMap(bundle.meta?.roles ?? []);
    const nextLegacyByFilename = buildTagMap(bundle.meta?.legacy_tags ?? []);
    const nextColorGroups = computeColorGroups(bundle.product?.variants ?? []);
    const nextColorByKey = computeColorAssignments(
      bundle.product?.variants ?? [],
      nextColorGroups
    );

    const env = new Set<string>();
    const variant = new Set<string>();
    for (const name of bundleFilenames) {
      if (nextRolesByFilename.get(name)?.has("environment")) env.add(name);
      if (nextRolesByFilename.get(name)?.has("variant")) variant.add(name);
    }

    const mainFilename = pickCurrentMain(
      nextRolesByFilename,
      nextLegacyByFilename,
      bundleFilenames
    );

    const base: BaseState = {
      mainFilename,
      envFilenames: env,
      variantTagFilenames: variant,
      colorByKey: nextColorByKey,
    };
    baseRef.current = base;

    // Draft state starts as base.
    setDraftDeletes(new Set());
    setDraftMain(base.mainFilename);
    setDraftEnv(new Set(base.envFilenames));
    setDraftVariantTag(new Set(base.variantTagFilenames));
    setDraftColorByKey({ ...base.colorByKey });

    // Preload next product images in the background.
    const nextId = items[currentIndex + 1]?.product_id ?? null;
    if (nextId) {
      void prefetchProduct(nextId);
    }
  };

  const fetchBundle = async (productId: string): Promise<CachedBundle> => {
    const [productRes, metaRes] = await Promise.all([
      fetch(`/api/products/${productId}`, { cache: "no-store" }),
      fetch(`/api/batch-image-editor/products/${productId}/images`, {
        cache: "no-store",
      }),
    ]);

    const productJson = await readJsonSafe(productRes);
    if (!productRes.ok) {
      throw new Error(productJson?.error || `Failed (${productRes.status}).`);
    }

    const metaJson = await readJsonSafe(metaRes);
    if (!metaRes.ok) {
      throw new Error(metaJson?.error || `Failed (${metaRes.status}).`);
    }

    const bundle: CachedBundle = {
      product: productJson as ProductResponse,
      meta: metaJson as ImagesMetaResponse,
    };

    const urls = Array.isArray(bundle.product?.thumbnail_urls)
      ? bundle.product.thumbnail_urls
      : Array.isArray(bundle.product?.image_urls)
        ? bundle.product.image_urls
        : [];
    preloadImages(urls.slice(0, 24));

    cacheRef.current.set(productId, bundle);
    return bundle;
  };

  const prefetchProduct = async (productId: string) => {
    if (!productId) return;
    if (cacheRef.current.has(productId)) return;
    if (prefetchingRef.current.has(productId)) return;
    prefetchingRef.current.add(productId);
    try {
      await fetchBundle(productId);
    } catch {
      // Ignore prefetch failures; the real load will show errors.
    } finally {
      prefetchingRef.current.delete(productId);
    }
  };

  const loadBatch = async () => {
    setLoadingBatch(true);
    setBatchError(null);
    try {
      const res = await fetch(`/api/batch-image-editor/batches/${batchId}`, {
        cache: "no-store",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(json?.error || `Failed (${res.status}).`);
      }

      setBatchName(String(json?.batch?.name ?? ""));
      const nextItems = Array.isArray(json?.items)
        ? (json.items as BatchItem[])
        : [];
      setItems(nextItems);

      const iParam = Number(searchParams.get("i") ?? "1");
      const nextIndex = Number.isFinite(iParam) ? Math.max(0, iParam - 1) : 0;
      setCurrentIndex(Math.min(nextIndex, Math.max(0, nextItems.length - 1)));
    } catch (err: any) {
      setBatchError(err?.message || "Failed to load batch.");
      setItems([]);
      setBatchName("");
    } finally {
      setLoadingBatch(false);
    }
  };

  const loadProduct = async (productId: string) => {
    if (!productId) return;
    setProductLoading(true);
    setProductError(null);
    try {
      const cached = cacheRef.current.get(productId) ?? null;
      if (cached) {
        applyBundle(cached);
        return;
      }
      const bundle = await fetchBundle(productId);
      applyBundle(bundle);
    } catch (err: any) {
      setProductError(err?.message || "Failed to load product.");
      setProductData(null);
      setRoles([]);
      setLegacyTags([]);
      baseRef.current = null;
    } finally {
      setProductLoading(false);
    }
  };

  const callAction = async (productId: string, payload: any) => {
    const res = await fetch(`/api/batch-image-editor/products/${productId}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(json?.error || `Action failed (${res.status}).`);
    }
    return json;
  };

  const onSave = async () => {
    const productId = currentItem?.product_id ?? null;
    if (!productId || !baseRef.current) return;

    setSaving(true);
    setStatus(null);
    try {
      const base = baseRef.current;

      // Roles: environment + variant tag
      if (!setsEqual(draftEnv, base.envFilenames)) {
        await callAction(productId, { action: "clear_role", role: "environment" });
        if (draftEnv.size > 0) {
          await callAction(productId, {
            action: "set_role",
            role: "environment",
            filenames: Array.from(draftEnv),
          });
        }
      }

      if (!setsEqual(draftVariantTag, base.variantTagFilenames)) {
        await callAction(productId, { action: "clear_role", role: "variant" });
        if (draftVariantTag.size > 0) {
          await callAction(productId, {
            action: "set_role",
            role: "variant",
            filenames: Array.from(draftVariantTag),
          });
        }
      }

      // Variant color assignments
      const groupByKey = new Map<string, ColorGroup>();
      colorGroups.forEach((g) => groupByKey.set(g.key, g));

      for (const [colorKey, desiredFilename] of Object.entries(draftColorByKey)) {
        const currentFilename = base.colorByKey[colorKey] ?? null;
        if ((desiredFilename ?? null) === (currentFilename ?? null)) continue;
        const group = groupByKey.get(colorKey) ?? null;
        if (!group || group.variantIds.length === 0) continue;

        if (desiredFilename) {
          await callAction(productId, {
            action: "assign_variant_image",
            variant_ids: group.variantIds,
            filename: desiredFilename,
          });
        } else {
          await callAction(productId, {
            action: "clear_variant_image",
            variant_ids: group.variantIds,
          });
        }
      }

      // Main selection (renames file on disk)
      const desiredMain = draftMain ?? null;
      if (desiredMain && desiredMain !== (base.mainFilename ?? null)) {
        await callAction(productId, { action: "set_main", filename: desiredMain });
      }

      // Deletions
      if (draftDeletes.size > 0) {
        const names = Array.from(draftDeletes);
        await callAction(productId, { action: "delete_images", filenames: names });
      }

      // Reload product state once at the end.
      cacheRef.current.delete(productId);
      await loadProduct(productId);
      setStatus({ intent: "success", text: "Saved." });
    } catch (err: any) {
      setStatus({ intent: "error", text: err?.message || "Failed to save." });
    } finally {
      setSaving(false);
    }
  };

  const jumpTo = (idx: number) => {
    if (hasUnsavedChanges) {
      const ok = window.confirm("You have unsaved changes. Discard them?");
      if (!ok) return;
    }
    const next = Math.max(0, Math.min(idx, Math.max(0, items.length - 1)));
    setCurrentIndex(next);
    router.replace(
      `/app/products/batch-image-editor/${batchId}/edit?i=${next + 1}`
    );
  };

  useEffect(() => {
    if (!batchId) return;
    void loadBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    const productId = currentItem?.product_id;
    if (!productId) return;
    void loadProduct(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.product_id]);

  useEffect(() => {
    const nextId = items[currentIndex + 1]?.product_id ?? null;
    if (!nextId) return;
    void prefetchProduct(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, currentIndex]);

  const onToggleDelete = (filename: string) => {
    setDraftDeletes((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
    if (draftMain === filename) setDraftMain(null);
  };

  const onSetMain = (filename: string) => {
    setDraftMain(filename);
    setDraftDeletes((prev) => {
      const next = new Set(prev);
      next.delete(filename);
      return next;
    });
  };

  const onToggleEnv = (filename: string) => {
    setDraftEnv((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const onToggleVariantTag = (filename: string) => {
    setDraftVariantTag((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const onAssignColorToFilename = (filename: string, colorKey: string | null) => {
    if (!colorKey) return;
    if (colorKey === "__clear__") {
      setDraftColorByKey((prev) => {
        const next: Record<string, string | null> = { ...prev };
        for (const [key, currentFilename] of Object.entries(next)) {
          if (currentFilename === filename) {
            next[key] = null;
          }
        }
        return next;
      });
      return;
    }

    setDraftColorByKey((prev) => ({
      ...prev,
      [colorKey]: filename,
    }));
  };

  const productTitle =
    productData?.product?.title ||
    productData?.product?.spu ||
    (currentItem?.product?.spu ?? null) ||
    currentItem?.product_id ||
    "";

  return (
    <div className={styles.layout}>
      <div className={styles.headerRow}>
        <Link href="/app/products/batch-image-editor">
          <Button size="small">Back</Button>
        </Link>
        <Text size={600} weight="semibold">
          {batchName || "Batch"}
        </Text>
        {items.length ? (
          <Text className={styles.subtle}>
            {currentIndex + 1} / {items.length}
          </Text>
        ) : null}
      </div>

      {loadingBatch ? (
        <Spinner label="Loading batch..." />
      ) : batchError ? (
        <MessageBar intent="error">{batchError}</MessageBar>
      ) : items.length === 0 ? (
        <MessageBar intent="warning">This batch has no products.</MessageBar>
      ) : (
        <>
          {status ? <MessageBar intent={status.intent}>{status.text}</MessageBar> : null}

          <Card className={styles.productCard}>
            <Text size={600} weight="semibold">
              {productTitle}
            </Text>
            {currentItem?.product?.spu ? (
              <Text className={styles.subtle}>SPU: {currentItem.product.spu}</Text>
            ) : null}
          </Card>

          <div className={styles.toolbar}>
            <Button
              size="small"
              onClick={() => jumpTo(currentIndex - 1)}
              disabled={currentIndex <= 0 || saving}
            >
              Prev
            </Button>
            <Button
              size="small"
              onClick={() => jumpTo(currentIndex + 1)}
              disabled={currentIndex >= items.length - 1 || saving}
            >
              Next
            </Button>

            <Button
              size="small"
              appearance="primary"
              onClick={onSave}
              disabled={!hasUnsavedChanges || saving || productLoading}
            >
              {saving ? "Saving..." : "Save"}
            </Button>

            <div className={styles.toolbarRight}>
              <Text className={styles.subtle}>
                {hasUnsavedChanges ? "Unsaved changes" : "Up to date"}
              </Text>
            </div>
          </div>

          {productLoading ? (
            <Spinner label="Loading product..." />
          ) : productError ? (
            <MessageBar intent="error">{productError}</MessageBar>
          ) : (
            <div className={styles.gallery}>
              {imageUrls.map((url) => {
                const filename = getFilenameFromUrl(url);
                if (!filename) return null;

                const pendingDelete = draftDeletes.has(filename);
                const isMain = (draftMain ?? null) === filename;
                const isEnv = draftEnv.has(filename);
                const isVariantTag = draftVariantTag.has(filename);

                const legacy = legacyTagsByFilename.get(filename) ?? new Set<string>();
                const manual = rolesByFilename.get(filename) ?? new Set<string>();
                const assignedSkus = variantSkusByFilename.get(filename) ?? [];

                const assignedColorsKeys = colorByFilename.get(filename) ?? [];
                const assignedColors = assignedColorsKeys
                  .map((key) => colorLabelByKey.get(key) ?? key)
                  .filter(Boolean);

                const dropdownSelected =
                  assignedColorsKeys.length === 1 ? assignedColorsKeys[0] : "";

                return (
                  <div
                    key={url}
                    className={mergeClasses(
                      styles.tile,
                      isMain ? styles.tilePendingMain : undefined,
                      pendingDelete ? styles.tilePendingDelete : undefined
                    )}
                  >
                    <img src={url} alt={filename} className={styles.tileImg} />
                    <div className={styles.tileMeta}>
                      <div className={styles.tileBadges}>
                        {pendingDelete ? (
                          <Badge appearance="filled" color="danger">
                            delete
                          </Badge>
                        ) : null}
                        {isMain ? (
                          <Badge appearance="filled" color="success">
                            main
                          </Badge>
                        ) : null}
                        {isEnv ? <Badge appearance="outline">environment</Badge> : null}
                        {isVariantTag ? <Badge appearance="outline">variant</Badge> : null}

                        {Array.from(legacy)
                          .filter((tag) =>
                            ["hero_white", "hero_composite", "environment", "variant"].includes(tag)
                          )
                          .map((tag) => (
                            <Badge key={`legacy-${filename}-${tag}`} appearance="outline">
                              {tag}
                            </Badge>
                          ))}

                        {Array.from(manual)
                          .filter((tag) =>
                            ["main", "environment", "variant"].includes(tag)
                          )
                          .map((tag) => (
                            <Badge key={`manual-${filename}-${tag}`} appearance="filled">
                              {tag}
                            </Badge>
                          ))}

                        {assignedColors.length ? (
                          <Badge appearance="filled">{assignedColors.join(", ")}</Badge>
                        ) : null}
                      </div>

                      <div className={styles.filename}>{filename}</div>

                      {assignedSkus.length ? (
                        <div className={styles.variantText}>
                          Variant SKU:{" "}
                          {assignedSkus.slice(0, 3).join(", ")}
                          {assignedSkus.length > 3 ? ` (+${assignedSkus.length - 3})` : ""}
                        </div>
                      ) : null}

                      <div className={styles.tileActions}>
                        <Button
                          size="small"
                          className={mergeClasses(isMain ? styles.actionMainActive : undefined)}
                          onClick={() => onSetMain(filename)}
                          disabled={saving}
                        >
                          Set main
                        </Button>

                        <Button
                          size="small"
                          className={mergeClasses(isEnv ? styles.actionEnvActive : undefined)}
                          onClick={() => onToggleEnv(filename)}
                          disabled={saving}
                        >
                          Environmental
                        </Button>

                        <Button
                          size="small"
                          className={mergeClasses(isVariantTag ? styles.actionVariantActive : undefined)}
                          onClick={() => onToggleVariantTag(filename)}
                          disabled={saving}
                        >
                          Variant
                        </Button>

                        <Button
                          size="small"
                          className={mergeClasses(pendingDelete ? styles.actionDeleteActive : undefined)}
                          onClick={() => onToggleDelete(filename)}
                          disabled={saving}
                        >
                          Delete
                        </Button>

                        <Field label="Color" style={{ minWidth: 160 }}>
                          <Dropdown
                            placeholder={
                              assignedColorsKeys.length > 1
                                ? `${assignedColorsKeys.length} colors`
                                : "Assign..."
                            }
                            selectedOptions={dropdownSelected ? [dropdownSelected] : []}
                            onOptionSelect={(_, data) =>
                              onAssignColorToFilename(
                                filename,
                                typeof data.optionValue === "string"
                                  ? data.optionValue
                                  : null
                              )
                            }
                            disabled={saving || colorGroups.length === 0}
                          >
                            <Option value="__clear__">Clear</Option>
                            {colorGroups.map((group) => (
                              <Option key={group.key} value={group.key}>
                                {group.label}
                              </Option>
                            ))}
                          </Dropdown>
                        </Field>

                        <Tooltip content="Coming soon" relationship="label">
                          <Button size="small" disabled>
                            AI edit
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
