import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT } from "@/lib/drafts";

export const runtime = "nodejs";

const UPLOAD_DIR = "/srv/incoming-scripts/uploads/draft-imports";
const TEMP_EXTRACT_ROOT = "/tmp";

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
};

const parseEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  });
  return out;
};

const loadSupabaseEnv = () => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"];
  const env: Record<string, string | undefined> = {};
  keys.forEach((key) => {
    if (process.env[key]) env[key] = process.env[key];
  });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    const fromNodeTools = parseEnvFile("/srv/node-tools/.env");
    env.SUPABASE_URL = env.SUPABASE_URL ?? fromNodeTools.SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE =
      env.SUPABASE_SERVICE_ROLE ?? fromNodeTools.SUPABASE_SERVICE_ROLE;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    const fromShopify = parseEnvFile("/srv/shopify-sync/.env");
    env.SUPABASE_URL = env.SUPABASE_URL ?? fromShopify.SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE =
      env.SUPABASE_SERVICE_ROLE ?? fromShopify.SUPABASE_SERVICE_ROLE;
  }
  return env;
};

const normalizeSku = (value: unknown) => String(value || "").trim();

const readWorkbookRows = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const textSheet =
    workbook.getWorksheet("Text Output") ?? workbook.worksheets[0];
  const variationSheet =
    workbook.getWorksheet("Variation Output") ?? workbook.worksheets[1];

  const parseSheet = (sheet?: ExcelJS.Worksheet) => {
    if (!sheet) return { headers: [], rows: [] as Record<string, string>[] };
    const headers: string[] = [];
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim();
    });
    const rows: Record<string, string>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const entry: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        const value = row.getCell(idx + 1).value;
        entry[header] =
          value === null || value === undefined ? "" : String(value);
      });
      rows.push(entry);
    });
    return { headers, rows };
  };

  const text = parseSheet(textSheet);
  const variations = parseSheet(variationSheet);
  return { text, variations };
};

const writeWorkbook = async (
  filePath: string,
  text: { headers: string[]; rows: Record<string, string>[] },
  variations: { headers: string[]; rows: Record<string, string>[] }
) => {
  const workbook = new ExcelJS.Workbook();
  const textSheet = workbook.addWorksheet("Text Output");
  if (text.headers.length > 0) {
    textSheet.addRow(text.headers);
    text.rows.forEach((row) => {
      textSheet.addRow(text.headers.map((header) => row[header] ?? ""));
    });
  }
  if (variations.headers.length > 0) {
    const varSheet = workbook.addWorksheet("Variation Output");
    varSheet.addRow(variations.headers);
    variations.rows.forEach((row) => {
      varSheet.addRow(variations.headers.map((header) => row[header] ?? ""));
    });
  }
  await workbook.xlsx.writeFile(filePath);
};

const parseRawRow = (raw: unknown) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, string>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
};

const writeRenameWorkbook = async (
  filePath: string,
  rows: Array<{ spu: string; sku: string; color: string }>
) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["SPU", "SKU", "Color_SE"]);
  rows.forEach((row) => {
    sheet.addRow([row.spu, row.sku, row.color]);
  });
  await workbook.xlsx.writeFile(filePath);
};

const extractZip = (zipPath: string, outDir: string) => {
  ensureDir(outDir);
  const script = [
    "import zipfile, os, sys",
    `zip_path = ${JSON.stringify(zipPath)}`,
    `out_dir = ${JSON.stringify(outDir)}`,
    "with zipfile.ZipFile(zip_path, 'r') as zf:",
    "  for member in zf.infolist():",
    "    name = member.filename",
    "    if name.startswith('/') or name.startswith('\\\\'):",
    "      continue",
    "    parts = [p for p in name.split('/') if p and p not in ('.', '..')]",
    "    safe_name = os.path.join(*parts) if parts else ''",
    "    if not safe_name:",
    "      continue",
    "    dest_path = os.path.normpath(os.path.join(out_dir, safe_name))",
    "    if not dest_path.startswith(os.path.abspath(out_dir)):",
    "      continue",
    "    if member.is_dir():",
    "      os.makedirs(dest_path, exist_ok=True)",
    "    else:",
    "      os.makedirs(os.path.dirname(dest_path), exist_ok=True)",
    "      with zf.open(member) as src, open(dest_path, 'wb') as dst:",
    "        dst.write(src.read())",
  ].join("\n");
  const res = spawnSync("python", ["-c", script]);
  return res.status === 0;
};

const listRunFolders = () => {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  return fs
    .readdirSync(DRAFT_ROOT, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("Drafted-Products-")
    )
    .map((entry) => entry.name);
};

const listSpuFolders = (dir: string) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
};

const mapZipSpus = (extractedRoot: string) => {
  const roots = listSpuFolders(extractedRoot);
  if (roots.length === 1 && roots[0].startsWith("Drafted-Products-")) {
    const base = path.join(extractedRoot, roots[0]);
    const spus = listSpuFolders(base);
    return new Map(spus.map((spu) => [spu, path.join(base, spu)]));
  }
  return new Map(roots.map((spu) => [spu, path.join(extractedRoot, spu)]));
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const workbookFile = formData.get("workbook");
  const zipFile = formData.get("images_zip");
  const purgeMissing =
    formData.get("purgeMissing")?.toString() !== "false";

  if (!workbookFile && !zipFile) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  ensureDir(UPLOAD_DIR);
  const stamp = Date.now();
  const errors: string[] = [];
  let workbookPath: string | null = null;
  let zipPath: string | null = null;

  if (workbookFile instanceof File) {
    workbookPath = path.join(UPLOAD_DIR, `draft-import-${stamp}.xlsx`);
    const buffer = Buffer.from(await workbookFile.arrayBuffer());
    fs.writeFileSync(workbookPath, buffer);
  }

  if (zipFile instanceof File) {
    zipPath = path.join(UPLOAD_DIR, `draft-import-${stamp}.zip`);
    const buffer = Buffer.from(await zipFile.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);
  }

  let textRows: { headers: string[]; rows: Record<string, string>[] } = {
    headers: [],
    rows: [],
  };
  let variationRows: { headers: string[]; rows: Record<string, string>[] } = {
    headers: [],
    rows: [],
  };
  const uploadSpuSet = new Set<string>();
  const workbookSpuSet = new Set<string>();
  const verifySpuSet = new Set<string>();

  if (workbookPath) {
    const parsed = await readWorkbookRows(workbookPath);
    textRows = parsed.text;
    variationRows = parsed.variations;
    const skuHeader = textRows.headers.find(
      (header) => header.toLowerCase() === "sku"
    );
    if (!skuHeader) {
      return NextResponse.json(
        { error: "Workbook missing SKU column." },
        { status: 400 }
      );
    }
    textRows.rows.forEach((row) => {
      const sku = normalizeSku(row[skuHeader]);
      if (sku) {
        uploadSpuSet.add(sku);
        workbookSpuSet.add(sku);
        verifySpuSet.add(sku);
      }
    });
  }

  let extractedRoot: string | null = null;
  let zipSpuMap: Map<string, string> = new Map();
  if (zipPath) {
    extractedRoot = path.join(TEMP_EXTRACT_ROOT, `draft-import-${stamp}`);
    const ok = extractZip(zipPath, extractedRoot);
    if (!ok) {
      return NextResponse.json(
        { error: "Unable to extract ZIP." },
        { status: 500 }
      );
    }
    zipSpuMap = mapZipSpus(extractedRoot);
    zipSpuMap.forEach((_value, spu) => {
      uploadSpuSet.add(spu);
      verifySpuSet.add(spu);
    });
  }

  if (uploadSpuSet.size === 0) {
    return NextResponse.json(
      { error: "No SPUs found in uploads." },
      { status: 400 }
    );
  }

  const runFolders = listRunFolders();
  const runIndex = new Map<string, Set<string>>();
  runFolders.forEach((run) => {
    const runPath = path.join(DRAFT_ROOT, run);
    const spus = listSpuFolders(runPath);
    runIndex.set(run, new Set(spus));
  });

  const matchedRuns = runFolders.filter((run) => {
    const runSpus = runIndex.get(run);
    if (!runSpus) return false;
    for (const spu of uploadSpuSet) {
      if (runSpus.has(spu)) return true;
    }
    return false;
  });

  if (matchedRuns.length === 0) {
    return NextResponse.json(
      { error: "No matching draft runs found for uploaded SPUs." },
      { status: 404 }
    );
  }

  const supabaseEnv = loadSupabaseEnv();
  const adminClient =
    supabaseEnv.SUPABASE_URL && supabaseEnv.SUPABASE_SERVICE_ROLE
      ? createClient(supabaseEnv.SUPABASE_URL, supabaseEnv.SUPABASE_SERVICE_ROLE, {
          auth: { persistSession: false },
        })
      : null;
  const dbClient = adminClient ?? supabase;

  let purgedSpuCount = 0;
  let filesReplacedCount = 0;
  const uploadSpusByRun = new Map<string, Set<string>>();

  for (const run of matchedRuns) {
    const runSpus = runIndex.get(run) ?? new Set<string>();
    const uploadSpusForRun = new Set(
      [...uploadSpuSet].filter((spu) => runSpus.has(spu))
    );
    uploadSpusByRun.set(run, uploadSpusForRun);

    if (workbookPath) {
      const skuHeader = textRows.headers.find(
        (header) => header.toLowerCase() === "sku"
      );
      const tempWorkbook = path.join(
        UPLOAD_DIR,
        `draft-import-${stamp}-${run}.xlsx`
      );
      const filteredTextRows = textRows.rows.filter((row) =>
        uploadSpusForRun.has(normalizeSku(row[skuHeader ?? "SKU"]))
      );
      const variationHeader = variationRows.headers.find(
        (header) => header.toLowerCase() === "sku"
      );
      const filteredVariationRows = variationRows.rows.filter((row) =>
        uploadSpusForRun.has(normalizeSku(row[variationHeader ?? "SKU"]))
      );
      await writeWorkbook(
        tempWorkbook,
        { headers: textRows.headers, rows: filteredTextRows },
        { headers: variationRows.headers, rows: filteredVariationRows }
      );

      const env = {
        ...process.env,
        SUPABASE_URL: supabaseEnv.SUPABASE_URL ?? process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE:
          supabaseEnv.SUPABASE_SERVICE_ROLE ??
          process.env.SUPABASE_SERVICE_ROLE,
      };
      const ingestScript = process.env.DRAFT_INGEST_SCRIPT;
      if (!ingestScript) {
        errors.push("Missing DRAFT_INGEST_SCRIPT env.");
        continue;
      }
      const args = [
        ingestScript,
        "--input",
        tempWorkbook,
        "--image-root",
        DRAFT_ROOT,
        "--run-folder",
        run,
      ];
      const res = spawnSync("node", args, { stdio: "inherit", env });
      if (res.status !== 0) {
        errors.push(`Ingest failed for ${run}`);
      }
    }

    if (zipPath && zipSpuMap.size > 0) {
      const runPath = path.join(DRAFT_ROOT, run);
      uploadSpusForRun.forEach((spu) => {
        const src = zipSpuMap.get(spu);
        if (!src) return;
        const dest = path.join(runPath, spu);
        try {
          fs.rmSync(dest, { recursive: true, force: true });
        } catch {}
        fs.cpSync(src, dest, { recursive: true });
        filesReplacedCount += 1;
      });
    }

    if (purgeMissing) {
      const missing = [...runSpus].filter((spu) => !uploadSpusForRun.has(spu));
      if (missing.length > 0) {
        purgedSpuCount += missing.length;
        try {
          await dbClient
            .from("draft_variants")
            .delete()
            .in("draft_spu", missing);
          await dbClient
            .from("draft_products")
            .delete()
            .in("draft_spu", missing);
        } catch (err) {
          errors.push(
            `Failed to purge database rows for ${run}: ${(err as Error).message}`
          );
        }
        const runPath = path.join(DRAFT_ROOT, run);
        missing.forEach((spu) => {
          try {
            fs.rmSync(path.join(runPath, spu), {
              recursive: true,
              force: true,
            });
          } catch {}
        });
      }
    }
  }

  if (verifySpuSet.size > 0) {
    const verifyScript = process.env.DRAFT_VARIATION_VERIFY_SCRIPT;
    if (verifyScript && fs.existsSync(verifyScript)) {
      const verifyArgs = [
        verifyScript,
        "--spus",
        [...verifySpuSet].join(","),
      ];
      if (process.env.DRAFT_VARIATION_ALLOWED_FILE) {
        verifyArgs.push("--allowed-file", process.env.DRAFT_VARIATION_ALLOWED_FILE);
      }
      if (process.env.DRAFT_VARIATION_MODEL) {
        verifyArgs.push("--model", process.env.DRAFT_VARIATION_MODEL);
      }
      if (process.env.DRAFT_VARIATION_DRY_RUN === "true") {
        verifyArgs.push("--dry-run");
      }
      const res = spawnSync("node", verifyArgs, { stdio: "inherit", env: process.env });
      if (res.status !== 0) {
        errors.push("Variation verification failed.");
      }
    } else if (verifyScript) {
      errors.push(`Missing variation verification script at ${verifyScript}`);
    }
  }

  if (zipPath && uploadSpusByRun.size > 0) {
    const renameScript = process.env.DRAFT_IMAGE_RENAME_SCRIPT;
    if (renameScript && fs.existsSync(renameScript)) {
      for (const [run, spus] of uploadSpusByRun.entries()) {
        if (!spus.size) continue;
        const runPath = path.join(DRAFT_ROOT, run);
        const spuList = [...spus];
        const renameRows: Array<{ spu: string; sku: string; color: string }> = [];
        for (let i = 0; i < spuList.length; i += 200) {
          const chunk = spuList.slice(i, i + 200);
          const { data, error } = await dbClient
            .from("draft_variants")
            .select("draft_spu,draft_sku,draft_raw_row")
            .in("draft_spu", chunk);
          if (error) {
            errors.push(`Rename query failed for ${run}: ${error.message}`);
            break;
          }
          (data || []).forEach((row) => {
            const raw = parseRawRow(row.draft_raw_row);
            renameRows.push({
              spu: String(row.draft_spu || "").trim(),
              sku: String(row.draft_sku || "").trim(),
              color: String(raw.variation_color_se || "").trim(),
            });
          });
        }
        if (!renameRows.length) {
          errors.push(`No variant rows found for rename in ${run}`);
          continue;
        }
        const renameWorkbook = path.join(
          UPLOAD_DIR,
          `draft-import-${stamp}-${run}-rename.xlsx`
        );
        await writeRenameWorkbook(renameWorkbook, renameRows);

        const renameArgs = [
          renameScript,
          "--input",
          renameWorkbook,
          "--image-root",
          runPath,
        ];
        if (process.env.DRAFT_VARIATION_ALLOWED_FILE) {
          renameArgs.push("--allowed-file", process.env.DRAFT_VARIATION_ALLOWED_FILE);
        }
        if (process.env.DRAFT_IMAGE_RENAME_MODEL) {
          renameArgs.push("--model", process.env.DRAFT_IMAGE_RENAME_MODEL);
        }
        const nodePaths = [
          process.env.NODE_PATH,
          "/srv/node-tools/product-processor/node_modules",
          "/srv/partner-product-explorer/node_modules",
        ].filter(Boolean);
        const renameEnv = {
          ...process.env,
          NODE_PATH: nodePaths.join(path.delimiter),
        };
        const res = spawnSync("node", renameArgs, { stdio: "inherit", env: renameEnv });
        if (res.status !== 0) {
          errors.push(`Image rename failed for ${run}`);
        }
      }
    } else if (renameScript) {
      errors.push(`Missing image rename script at ${renameScript}`);
    }
  }

  if (extractedRoot) {
    try {
      fs.rmSync(extractedRoot, { recursive: true, force: true });
    } catch {}
  }

  return NextResponse.json({
    matchedRuns,
    uploadSpuCount: uploadSpuSet.size,
    purgedSpuCount,
    filesReplacedCount,
    errors,
  });
}
