import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = { productId: "", spu: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--productId" || a === "--id") {
      args.productId = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (a === "--spu") {
      args.spu = argv[i + 1] || "";
      i += 1;
      continue;
    }
  }
  return args;
}

const normalizeHtml = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const toHtmlFromText = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\\n/g, "<br/>");
};

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}Z`;
}

async function main() {
  const { productId, spu } = parseArgs(process.argv);
  if (!productId && !spu) {
    console.error("Usage: node scripts/reset-product-to-legacy.mjs --productId <uuid> OR --spu <SPU>");
    process.exit(2);
  }

  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
    raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if (!key) return;
        if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase service credentials in environment (.env.local).");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let prodQuery = admin
    .from("catalog_products")
    .select("id, spu, title, subtitle, description_html, legacy_title_sv, legacy_description_sv, legacy_bullets_sv")
    .limit(1);
  if (productId) prodQuery = prodQuery.eq("id", productId);
  else prodQuery = prodQuery.eq("spu", spu);

  const { data: product, error: productError } = await prodQuery.maybeSingle();
  if (productError) {
    console.error(productError.message);
    process.exit(1);
  }
  if (!product) {
    console.error("Product not found.");
    process.exit(1);
  }

  const pid = String(product.id);
  const pspu = String(product.spu || "");

  const targetKeys = [
    "short_title",
    "long_title",
    "subtitle",
    "bullets_short",
    "bullets",
    "bullets_long",
    "description_short",
    "description_extended",
    "specs",
    "presentation",
    "seometadesc",
  ];
  const namespaces = ["product_global", "product.global"];

  const { data: defs, error: defError } = await admin
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("key", targetKeys)
    .in("namespace", namespaces);
  if (defError) {
    console.error(defError.message);
    process.exit(1);
  }
  const defIds = (defs || []).map((d) => String(d.id)).filter(Boolean);

  const { data: existingMeta, error: metaError } = defIds.length
    ? await admin
        .from("metafield_values")
        .select("id, definition_id, target_id, value_text, updated_at, updated_at_source")
        .eq("target_type", "product")
        .eq("target_id", pid)
        .in("definition_id", defIds)
    : { data: [], error: null };
  if (metaError) {
    console.error(metaError.message);
    process.exit(1);
  }

  // Best-effort bullet backup from existing metafields before deletion.
  const defsById = new Map((defs || []).map((d) => [String(d.id), d]));
  const bulletsCandidates = [];
  for (const row of existingMeta || []) {
    const def = defsById.get(String(row.definition_id));
    const key = def?.key ? String(def.key) : "";
    if (!key) continue;
    if (key === "bullets" || key === "bullets_long" || key === "bullets_short") {
      const txt = String(row.value_text || "").trim();
      if (txt) bulletsCandidates.push(txt);
    }
  }
  const bulletsBackup = bulletsCandidates[0] || "";

  // Backup current state before mutating.
  const backupDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `legacy-reset-backup-${pspu || pid}-${nowStamp()}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ product, metafield_definitions: defs, metafield_values: existingMeta }, null, 2),
    "utf8"
  );

  const legacyTitle = String(product.title || pspu || pid).trim();
  const legacyDesc = normalizeHtml(product.description_html || "") || legacyTitle;
  const legacyBullets = bulletsBackup;

  const { error: updateError } = await admin
    .from("catalog_products")
    .update({
      legacy_title_sv: legacyTitle,
      legacy_description_sv: legacyDesc,
      legacy_bullets_sv: legacyBullets,
      description_html: toHtmlFromText(legacyDesc),
    })
    .eq("id", pid);
  if (updateError) {
    console.error(updateError.message);
    process.exit(1);
  }

  if (defIds.length > 0) {
    const { error: delError } = await admin
      .from("metafield_values")
      .delete()
      .eq("target_type", "product")
      .eq("target_id", pid)
      .in("definition_id", defIds);
    if (delError) {
      console.error(delError.message);
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        product_id: pid,
        spu: pspu,
        backup_path: backupPath,
        deleted_metafield_value_count: (existingMeta || []).length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
