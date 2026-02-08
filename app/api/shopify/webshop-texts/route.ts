import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BASE_THEME_DIR = "/srv/shopify-sync/themes/base";
const STORES_DIR = "/srv/shopify-sync/themes/stores";
const DEFAULT_STORE_CODE = "wellando";

const TEXT_SETTING_TYPES = new Set([
  "text",
  "textarea",
  "richtext",
  "inline_richtext",
  "html",
  "liquid",
]);

type StoreInfo = {
  code: string;
  name?: string;
  domain?: string;
};

type TextItem = {
  id: string; // `${assetKey}#${jsonPointer}`
  assetKey: string;
  jsonPointer: string;
  scope: "global" | "section" | "block";
  sectionId?: string;
  sectionType?: string;
  blockId?: string;
  blockType?: string;
  settingId: string;
  settingType: string;
  label?: string;
  info?: string;
  value: string;
};

type SchemaSettingMeta = {
  id: string;
  type: string;
  label?: string;
  info?: string;
};

type SectionSchemaIndex = {
  global: Record<string, SchemaSettingMeta>;
  sections: Record<string, Record<string, SchemaSettingMeta>>;
  blocks: Record<string, Record<string, Record<string, SchemaSettingMeta>>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const ensureAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { allowed: true, response: null };
};

const escapePointerSegment = (segment: string) =>
  segment.replace(/~/g, "~0").replace(/\//g, "~1");

const unescapePointerSegment = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

const parseTextId = (id: string) => {
  const idx = id.indexOf("#");
  if (idx < 0) throw new Error("Invalid text id.");
  return { assetKey: id.slice(0, idx), jsonPointer: id.slice(idx + 1) };
};

const getPointerSegments = (pointer: string) => {
  if (!pointer.startsWith("/")) throw new Error("Invalid JSON pointer.");
  return pointer
    .split("/")
    .slice(1)
    .map((seg) => unescapePointerSegment(seg));
};

const setJsonPointerValue = (root: unknown, pointer: string, value: string) => {
  const segments = getPointerSegments(pointer);
  if (!segments.length) throw new Error("Cannot set root pointer.");

  let node: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) {
        throw new Error(`Invalid array index in pointer: ${pointer}`);
      }
      node = node[idx] as unknown;
      continue;
    }
    if (!isRecord(node)) {
      throw new Error(`Pointer path not found: ${pointer}`);
    }
    node = node[key];
  }

  const lastKey = segments[segments.length - 1];
  if (Array.isArray(node)) {
    const idx = Number(lastKey);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) {
      throw new Error(`Invalid array index in pointer: ${pointer}`);
    }
    node[idx] = value;
    return;
  }
  if (!isRecord(node)) {
    throw new Error(`Pointer path not found: ${pointer}`);
  }
  if (!Object.prototype.hasOwnProperty.call(node, lastKey)) {
    throw new Error(`Pointer key not found: ${pointer}`);
  }
  (node as Record<string, unknown>)[lastKey] = value;
};

const readJsonFile = async (filePath: string) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const listFiles = async (dir: string) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
};

const getStoreInfos = async (): Promise<StoreInfo[]> => {
  const entries = await fs.readdir(STORES_DIR, { withFileTypes: true });
  const stores: StoreInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const code = entry.name;
    const settingsPath = path.join(STORES_DIR, code, "theme.settings.json");
    try {
      const settings = await readJsonFile(settingsPath);
      const store = settings?.store ?? {};
      stores.push({
        code: String(store.code ?? code),
        name: store.name ? String(store.name) : undefined,
        domain: store.domain ? String(store.domain) : undefined,
      });
    } catch {
      stores.push({ code });
    }
  }
  return stores.sort((a, b) => a.code.localeCompare(b.code));
};

const loadStoreOverrides = async (storeCode: string) => {
  const p = path.join(STORES_DIR, storeCode, "theme.texts.json");
  try {
    const data = await readJsonFile(p);
    const overrides = data?.overrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      return { path: p, overrides: {} as Record<string, string> };
    }
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides)) {
      normalized[String(k)] = String(v ?? "");
    }
    return { path: p, overrides: normalized };
  } catch {
    return { path: p, overrides: {} as Record<string, string> };
  }
};

const loadSchemaIndex = async (): Promise<SectionSchemaIndex> => {
  const globalSchemaPath = path.join(BASE_THEME_DIR, "config", "settings_schema.json");
  const sectionsDir = path.join(BASE_THEME_DIR, "sections");

  const index: SectionSchemaIndex = { global: {}, sections: {}, blocks: {} };

  try {
    const rawSchema = (await readJsonFile(globalSchemaPath)) as unknown;
    const groups = Array.isArray(rawSchema) ? rawSchema : [];
    for (const group of groups) {
      if (!isRecord(group)) continue;
      const settings = Array.isArray(group.settings) ? group.settings : [];
      for (const setting of settings) {
        if (!isRecord(setting)) continue;
        const type = String(setting.type ?? "");
        const id = String(setting.id ?? "");
        if (!id || !TEXT_SETTING_TYPES.has(type)) continue;
        index.global[id] = {
          id,
          type,
          label: setting.label ? String(setting.label) : undefined,
          info: setting.info ? String(setting.info) : undefined,
        };
      }
    }
  } catch {
    // Global schema is helpful but non-critical.
  }

  const entries = await fs.readdir(sectionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".liquid")) continue;
    const sectionType = entry.name.replace(/\.liquid$/, "");
    const filePath = path.join(sectionsDir, entry.name);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const match = raw.match(
      /\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/i
    );
    if (!match) continue;
    try {
      const schema = JSON.parse(match[1].trim()) as unknown;
      if (!isRecord(schema)) continue;
      const sectionSettings = Array.isArray(schema.settings) ? schema.settings : [];
      for (const setting of sectionSettings) {
        if (!isRecord(setting)) continue;
        const type = String(setting.type ?? "");
        const id = String(setting.id ?? "");
        if (!id || !TEXT_SETTING_TYPES.has(type)) continue;
        index.sections[sectionType] = index.sections[sectionType] || {};
        index.sections[sectionType][id] = {
          id,
          type,
          label: setting.label ? String(setting.label) : undefined,
          info: setting.info ? String(setting.info) : undefined,
        };
      }

      const blocks = Array.isArray(schema.blocks) ? schema.blocks : [];
      for (const block of blocks) {
        if (!isRecord(block)) continue;
        const blockType = String(block.type ?? "");
        if (!blockType) continue;
        const blockSettings = Array.isArray(block.settings) ? block.settings : [];
        for (const setting of blockSettings) {
          if (!isRecord(setting)) continue;
          const type = String(setting.type ?? "");
          const id = String(setting.id ?? "");
          if (!id || !TEXT_SETTING_TYPES.has(type)) continue;
          index.blocks[sectionType] = index.blocks[sectionType] || {};
          index.blocks[sectionType][blockType] = index.blocks[sectionType][blockType] || {};
          index.blocks[sectionType][blockType][id] = {
            id,
            type,
            label: setting.label ? String(setting.label) : undefined,
            info: setting.info ? String(setting.info) : undefined,
          };
        }
      }
    } catch {
      // ignore schema parse errors
    }
  }

  return index;
};

const collectTextSetting = (
  out: TextItem[],
  params: Omit<TextItem, "id" | "assetKey" | "jsonPointer" | "value"> & {
    assetKey: string;
    jsonPointer: string;
    value: unknown;
  }
) => {
  if (typeof params.value !== "string") return;
  const id = `${params.assetKey}#${params.jsonPointer}`;
  out.push({
    id,
    assetKey: params.assetKey,
    jsonPointer: params.jsonPointer,
    scope: params.scope,
    sectionId: params.sectionId,
    sectionType: params.sectionType,
    blockId: params.blockId,
    blockType: params.blockType,
    settingId: params.settingId,
    settingType: params.settingType,
    label: params.label,
    info: params.info,
    value: params.value,
  });
};

const scanThemeTextItems = async (schemaIndex: SectionSchemaIndex) => {
  const items: TextItem[] = [];

  const assetCandidates: string[] = [];
  assetCandidates.push(path.join(BASE_THEME_DIR, "config", "settings_data.json"));

  try {
    const sectionEntries = await fs.readdir(path.join(BASE_THEME_DIR, "sections"), {
      withFileTypes: true,
    });
    for (const entry of sectionEntries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        assetCandidates.push(path.join(BASE_THEME_DIR, "sections", entry.name));
      }
    }
  } catch {
    // ignore
  }

  try {
    const templateFiles = await listFiles(path.join(BASE_THEME_DIR, "templates"));
    for (const full of templateFiles) {
      if (full.endsWith(".json")) assetCandidates.push(full);
    }
  } catch {
    // ignore
  }

  for (const full of assetCandidates) {
    const assetKey = path
      .relative(BASE_THEME_DIR, full)
      .split(path.sep)
      .join("/");
    let data: unknown;
    try {
      data = await readJsonFile(full);
    } catch {
      continue;
    }
    if (!isRecord(data)) continue;

    if (assetKey === "config/settings_data.json") {
      const current = data.current;
      if (isRecord(current)) {
        // Global theme settings live directly under current in this theme.
        for (const [k, v] of Object.entries(current)) {
          const meta = schemaIndex.global[k];
          if (!meta) continue;
          collectTextSetting(items, {
            assetKey,
            jsonPointer: `/current/${escapePointerSegment(k)}`,
            scope: "global",
            settingId: meta.id,
            settingType: meta.type,
            label: meta.label,
            info: meta.info,
            value: v,
          });
        }

        const sections = current.sections;
        if (isRecord(sections)) {
          for (const [sectionId, section] of Object.entries(sections)) {
            const sectionType = isRecord(section) ? String(section.type ?? "") : "";
            const sectionSettings =
              isRecord(section) && isRecord(section.settings) ? section.settings : null;
            if (sectionType && sectionSettings) {
              const settingMetas = schemaIndex.sections[sectionType] || {};
              for (const [settingId, val] of Object.entries(sectionSettings)) {
                const meta = settingMetas[settingId];
                if (!meta) continue;
                collectTextSetting(items, {
                  assetKey,
                  jsonPointer: `/current/sections/${escapePointerSegment(
                    sectionId
                  )}/settings/${escapePointerSegment(settingId)}`,
                  scope: "section",
                  sectionId,
                  sectionType,
                  settingId: meta.id,
                  settingType: meta.type,
                  label: meta.label,
                  info: meta.info,
                  value: val,
                });
              }
            }

            const blocks =
              isRecord(section) && isRecord(section.blocks) ? section.blocks : null;
            if (sectionType && blocks) {
              for (const [blockId, block] of Object.entries(blocks)) {
                const blockType = isRecord(block) ? String(block.type ?? "") : "";
                const blockSettings =
                  isRecord(block) && isRecord(block.settings) ? block.settings : null;
                if (!blockType || !blockSettings) continue;
                const blockMetas = (schemaIndex.blocks[sectionType] || {})[blockType] || {};
                for (const [settingId, val] of Object.entries(blockSettings)) {
                  const meta = blockMetas[settingId];
                  if (!meta) continue;
                  collectTextSetting(items, {
                    assetKey,
                    jsonPointer: `/current/sections/${escapePointerSegment(
                      sectionId
                    )}/blocks/${escapePointerSegment(
                      blockId
                    )}/settings/${escapePointerSegment(settingId)}`,
                    scope: "block",
                    sectionId,
                    sectionType,
                    blockId,
                    blockType,
                    settingId: meta.id,
                    settingType: meta.type,
                    label: meta.label,
                    info: meta.info,
                    value: val,
                  });
                }
              }
            }
          }
        }
      }
      continue;
    }

    const sections = data.sections;
    if (isRecord(sections)) {
      for (const [sectionId, section] of Object.entries(sections)) {
        const sectionType = isRecord(section) ? String(section.type ?? "") : "";
        const sectionSettings =
          isRecord(section) && isRecord(section.settings) ? section.settings : null;
        if (sectionType && sectionSettings) {
          const settingMetas = schemaIndex.sections[sectionType] || {};
          for (const [settingId, val] of Object.entries(sectionSettings)) {
            const meta = settingMetas[settingId];
            if (!meta) continue;
            collectTextSetting(items, {
              assetKey,
              jsonPointer: `/sections/${escapePointerSegment(
                sectionId
              )}/settings/${escapePointerSegment(settingId)}`,
              scope: "section",
              sectionId,
              sectionType,
              settingId: meta.id,
              settingType: meta.type,
              label: meta.label,
              info: meta.info,
              value: val,
            });
          }
        }

        const blocks =
          isRecord(section) && isRecord(section.blocks) ? section.blocks : null;
        if (sectionType && blocks) {
          for (const [blockId, block] of Object.entries(blocks)) {
            const blockType = isRecord(block) ? String(block.type ?? "") : "";
            const blockSettings =
              isRecord(block) && isRecord(block.settings) ? block.settings : null;
            if (!blockType || !blockSettings) continue;
            const blockMetas = (schemaIndex.blocks[sectionType] || {})[blockType] || {};
            for (const [settingId, val] of Object.entries(blockSettings)) {
              const meta = blockMetas[settingId];
              if (!meta) continue;
              collectTextSetting(items, {
                assetKey,
                jsonPointer: `/sections/${escapePointerSegment(
                  sectionId
                )}/blocks/${escapePointerSegment(
                  blockId
                )}/settings/${escapePointerSegment(settingId)}`,
                scope: "block",
                sectionId,
                sectionType,
                blockId,
                blockType,
                settingId: meta.id,
                settingType: meta.type,
                label: meta.label,
                info: meta.info,
                value: val,
              });
            }
          }
        }
      }
    }
  }

  // Stable order for the UI and diffs.
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
};

const runSyncScript = (store: string) => {
  const scriptPath = "/srv/shopify-sync/scripts/sync-webshop-texts.mjs";
  return new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath, `--store=${store}`],
      { timeout: 120000 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.toString().trim() || stdout?.toString().trim();
          reject(new Error(detail || "Sync script failed."));
          return;
        }
        resolve();
      }
    );
  });
};

export async function GET(request: Request) {
  const auth = await ensureAdmin();
  if (!auth.allowed) {
    return auth.response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const storeCode = String(searchParams.get("store") ?? DEFAULT_STORE_CODE);

  try {
    const stores = await getStoreInfos();
    const normalizedStore =
      stores.find((s) => s.code === storeCode)?.code ??
      stores[0]?.code ??
      DEFAULT_STORE_CODE;
    const schemaIndex = await loadSchemaIndex();
    const items = await scanThemeTextItems(schemaIndex);
    const storeOverrides = await loadStoreOverrides(normalizedStore);

    return NextResponse.json({
      stores,
      store: {
        code: normalizedStore,
        overrides_path: storeOverrides.path,
        overrides: storeOverrides.overrides,
      },
      base: {
        theme_dir: BASE_THEME_DIR,
        items_count: items.length,
        items,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to load webshop texts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await ensureAdmin();
  if (!auth.allowed) {
    return auth.response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      store_code?: string;
      base_edits?: Record<string, string>;
      store_overrides?: Record<string, string>;
      sync?: boolean;
    };

    const storeCode = String(body?.store_code ?? DEFAULT_STORE_CODE).trim();
    if (!storeCode) {
      return NextResponse.json({ error: "Missing store_code." }, { status: 400 });
    }

    const baseEdits = body?.base_edits && typeof body.base_edits === "object" ? body.base_edits : {};
    const storeOverridesRaw =
      body?.store_overrides && typeof body.store_overrides === "object"
        ? body.store_overrides
        : {};

    // Apply base edits grouped by asset key.
    const editsByAsset = new Map<string, Array<{ pointer: string; value: string }>>();
    for (const [id, rawValue] of Object.entries(baseEdits)) {
      const { assetKey, jsonPointer } = parseTextId(String(id));
      const value = String(rawValue ?? "");
      const list = editsByAsset.get(assetKey) ?? [];
      list.push({ pointer: jsonPointer, value });
      editsByAsset.set(assetKey, list);
    }

    for (const [assetKey, edits] of editsByAsset.entries()) {
      const filePath = path.join(BASE_THEME_DIR, assetKey);
      const data = await readJsonFile(filePath);
      for (const edit of edits) {
        setJsonPointerValue(data, edit.pointer, edit.value);
      }
      await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }

    // Persist store overrides.
    const overridePath = path.join(STORES_DIR, storeCode, "theme.texts.json");
    await fs.mkdir(path.dirname(overridePath), { recursive: true });
    const normalizedOverrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(storeOverridesRaw)) {
      normalizedOverrides[String(k)] = String(v ?? "");
    }
    const overridesSorted = Object.fromEntries(
      Object.entries(normalizedOverrides).sort(([a], [b]) => a.localeCompare(b))
    );
    const payload = {
      store: { code: storeCode },
      overrides: overridesSorted,
    };
    await fs.writeFile(overridePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    if (body?.sync !== false) {
      await runSyncScript(storeCode);
    }

    return NextResponse.json({
      ok: true,
      edited_assets: Array.from(editsByAsset.keys()),
      store_overrides_path: overridePath,
      store_overrides_count: Object.keys(overridesSorted).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to save webshop texts." },
      { status: 500 }
    );
  }
}
