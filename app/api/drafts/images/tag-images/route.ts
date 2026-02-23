import fs from "fs";
import path from "path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export const runtime = "nodejs";

const MODEL =
  process.env.DRAFT_IMAGE_TAG_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";

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

const ALLOWED_TAGS = new Set(["MAIN", "ENV", "INF", "VAR"]);
const ALLOWED_MAIN_SUBTYPES = new Set(["main_only", "main_composite"]);
const DIGI_TAG_PATTERN = /\(\s*DIGI\s*\)/i;
const AUTO_DIGI_DIMENSION_PX = 1424;

const normalizePathValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

const escapeXml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const normalizeTag = (
  value: unknown
): { tag: "MAIN" | "ENV" | "INF" | "VAR" | null; mainSubtype: string | null } => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!raw || raw === "NULL" || raw === "NONE" || raw === "UNTAGGED" || raw === "SKIP") {
    return { tag: null, mainSubtype: null };
  }

  if (raw === "MAIN_ONLY") {
    return { tag: "MAIN", mainSubtype: "main_only" };
  }
  if (raw === "MAIN_COMPOSITE" || raw === "MAIN_COMP") {
    return { tag: "MAIN", mainSubtype: "main_composite" };
  }
  if (ALLOWED_TAGS.has(raw)) {
    return { tag: raw as "MAIN" | "ENV" | "INF" | "VAR", mainSubtype: null };
  }
  return { tag: null, mainSubtype: null };
};

const normalizeMainSubtype = (value: unknown) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (ALLOWED_MAIN_SUBTYPES.has(normalized)) return normalized;
  return null;
};

const isDigiTaggedFileName = (fileName: string) =>
  DIGI_TAG_PATTERN.test(String(fileName || ""));

const pickFilesRoot = (productAbsolute: string, productRelative: string) => {
  const candidates = ["Files (F)", "files"];
  for (const name of candidates) {
    const abs = path.join(productAbsolute, name);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return {
        absolute: abs,
        relative: `${productRelative}/${name}`,
      };
    }
  }
  const fallbackAbs = path.join(productAbsolute, "Files (F)");
  fs.mkdirSync(fallbackAbs, { recursive: true });
  return {
    absolute: fallbackAbs,
    relative: `${productRelative}/Files (F)`,
  };
};

const createCellSvg = (cellWidth: number, cellHeight: number, imageSize: number, id: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="${cellHeight}">
  <rect x="0" y="${imageSize}" width="${cellWidth}" height="${cellHeight - imageSize}" fill="#000000"/>
  <rect x="0.5" y="0.5" width="${cellWidth - 1}" height="${cellHeight - 1}" fill="none" stroke="#000000" stroke-width="1"/>
  <text x="${cellWidth / 2}" y="${imageSize + Math.floor((cellHeight - imageSize) * 0.68)}" fill="#ffffff" font-size="19" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(id)}</text>
</svg>
`;

const createSheetLabelSvg = (width: number, height: number, text: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f4f4f4"/>
  <text x="12" y="20" fill="#555555" font-size="14" font-family="Arial, sans-serif">${escapeXml(text)}</text>
</svg>
`;

type SheetItem = {
  id: string;
  index: number;
  relativePath: string;
  fileName: string;
  absolutePath: string;
};

type TagDecision = {
  id: string;
  path: string;
  file_name: string;
  primary_tag: "MAIN" | "ENV" | "INF" | "VAR" | "DIGI" | null;
  main_subtype: string | null;
  confidence: number | null;
  reason: string;
};

const isDdPrefixFileName = (fileName: string) =>
  String(fileName || "").trim().toUpperCase().startsWith("DD");

const resolveAutoDigiReason = async (absolutePath: string, fileName: string) => {
  if (isDdPrefixFileName(fileName)) {
    return 'Auto-tagged DIGI: filename starts with "DD".';
  }
  try {
    const metadata = await sharp(absolutePath).metadata();
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (width === AUTO_DIGI_DIMENSION_PX || height === AUTO_DIGI_DIMENSION_PX) {
      return `Auto-tagged DIGI: image dimension includes ${AUTO_DIGI_DIMENSION_PX}px.`;
    }
  } catch {
    // Keep image in classifier pool if metadata cannot be read.
  }
  return null;
};

const buildContactSheet = async (items: SheetItem[]) => {
  const IMAGE_TILE_SIZE = 350;
  const LABEL_HEIGHT = 36;
  const CELL_WIDTH = IMAGE_TILE_SIZE;
  const CELL_HEIGHT = IMAGE_TILE_SIZE + LABEL_HEIGHT;
  const MAX_GRID = 4;
  const count = items.length;
  const cols = Math.min(MAX_GRID, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);
  const topLabelHeight = 30;
  const sheetWidth = Math.min(2000, cols * CELL_WIDTH);
  const sheetHeight = Math.min(2000, rows * CELL_HEIGHT + topLabelHeight);

  const composites: sharp.OverlayOptions[] = [];
  composites.push({
    input: Buffer.from(
      createSheetLabelSvg(
        sheetWidth,
        topLabelHeight,
        `Image Classifier Sheet • ${count} image(s) • 4 categories`
      )
    ),
    top: 0,
    left: 0,
  });

  for (const item of items) {
    const row = Math.floor(item.index / cols);
    const col = item.index % cols;
    const left = col * CELL_WIDTH;
    const top = topLabelHeight + row * CELL_HEIGHT;

    let imageInput: Buffer | null = null;
    try {
      imageInput = await sharp(item.absolutePath)
        .rotate()
        .resize(IMAGE_TILE_SIZE, IMAGE_TILE_SIZE, {
          fit: "contain",
          background: "#ececec",
        })
        .toBuffer();
    } catch {
      imageInput = null;
    }

    const cellBase = sharp({
      create: {
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        channels: 4,
        background: "#ececec",
      },
    });

    const cellComposites: sharp.OverlayOptions[] = [];
    if (imageInput) {
      cellComposites.push({ input: imageInput, left: 0, top: 0 });
    }
    cellComposites.push({
      input: Buffer.from(
        createCellSvg(CELL_WIDTH, CELL_HEIGHT, IMAGE_TILE_SIZE, item.id)
      ),
      left: 0,
      top: 0,
    });

    const cellBuffer = await cellBase.composite(cellComposites).png().toBuffer();
    composites.push({
      input: cellBuffer,
      left,
      top,
    });
  }

  return sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: "#f4f4f4",
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
};

const buildPrompt = (input: {
  spu: string;
  variantHints: string[];
  items: Array<{ id: string; fileName: string }>;
}) => {
  const variantsBlock =
    input.variantHints.length > 0
      ? input.variantHints.map((hint, i) => `${i + 1}. ${hint}`).join("\n")
      : "No variant text provided.";

  const idMapBlock = input.items
    .map((item) => `${item.id} -> ${item.fileName}`)
    .join("\n");

  return [
    "You are an expert e-commerce image classifier for Nordic/Swedish storefront quality.",
    "Analyze each tile by ID from the provided contact sheet.",
    "",
    "Categories:",
    "1) MAIN: ONLY for a clean product image with a completely white background.",
    "   - Be strict: white must be true white, not beige/cream/gray.",
    "   - If borders/background are messy, cluttered, or broken, do NOT use MAIN.",
    "   - main_subtype must be either main_only or main_composite.",
    "   - main_only = only product visible.",
    "   - main_composite = still white-background main image but includes hand/person/accessories.",
    "2) ENV: environmental scene / lifestyle / in-use context photo.",
    "3) INF: infographic, text-heavy, dimensions, graphics, instructions, technical layout.",
    "4) VAR: variant-series image set (color/count/type variants).",
    "5) UNTAGGED (null): use when image does not clearly fit MAIN/ENV/INF/VAR.",
    "",
    "Critical VAR rule:",
    "- Only use VAR when there is a clear repeated variant pattern across at least 2 images.",
    "- If uncertain, do NOT use VAR.",
    "",
    "Variant hints from product data:",
    variantsBlock,
    "",
    "Image ID map:",
    idMapBlock,
    "",
    "Return strict JSON only with this shape:",
    '{',
    '  "images": [',
    '    {',
    '      "id": "C001",',
    '      "primary_tag": "MAIN|ENV|INF|VAR|null",',
    '      "main_subtype": "main_only|main_composite|null",',
    '      "confidence": 0.0,',
    '      "reason": "short reason"',
    "    }",
    "  ],",
    '  "summary": "short summary"',
    "}",
    "",
    "Rules:",
    "- Include one row for each visible ID.",
    "- At most ONE image may be tagged as MAIN for the whole sheet.",
    "- Do NOT force a category. Leave primary_tag as null when uncertain.",
    "- If primary_tag is not MAIN, set main_subtype to null.",
    "- Keep reason concise (max 15 words).",
  ].join("\n");
};

const callOpenAiClassifier = async (prompt: string, contactSheetBuffer: Buffer) => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const imageB64 = contactSheetBuffer.toString("base64");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageB64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errText.slice(0, 600)}`);
  }

  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }
  const parsed = extractJsonFromText(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unable to parse classifier JSON.");
  }

  return {
    raw: content,
    parsed: parsed as Record<string, unknown>,
    model: String(payload?.model || MODEL),
  };
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

  const body = await request.json().catch(() => ({}));
  const folderPath = normalizePathValue(body?.folderPath);
  const requestedPaths = Array.isArray(body?.imagePaths)
    ? (body.imagePaths as unknown[])
    : [];
  const variantHints = Array.isArray(body?.variantHints)
    ? (body.variantHints as unknown[])
        .map((value) => String(value || "").trim())
        .filter((value) => Boolean(value))
        .slice(0, 24)
    : [];
  const spu = String(body?.spu || "").trim();

  if (!folderPath) {
    return NextResponse.json({ error: "Missing folderPath." }, { status: 400 });
  }

  const folderAbsolutePath = resolveDraftPath(folderPath);
  if (
    !folderAbsolutePath ||
    (!folderAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`) &&
      folderAbsolutePath !== DRAFT_ROOT)
  ) {
    return NextResponse.json({ error: "Invalid folderPath." }, { status: 400 });
  }
  if (!fs.existsSync(folderAbsolutePath) || !fs.statSync(folderAbsolutePath).isDirectory()) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  const normalizedPathSet = new Set<string>();
  const candidateItems: Array<{
    relativePath: string;
    fileName: string;
    absolutePath: string;
  }> = [];
  requestedPaths.forEach((value) => {
    const relative = normalizePathValue(value);
    if (!relative || normalizedPathSet.has(relative)) return;
    if (isDigiTaggedFileName(path.basename(relative))) return;
    const absolute = resolveDraftPath(relative);
    if (!absolute) return;
    if (!absolute.startsWith(`${folderAbsolutePath}${path.sep}`)) return;
    if (path.dirname(absolute) !== folderAbsolutePath) return;
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return;
    const ext = path.extname(absolute).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return;
    normalizedPathSet.add(relative);
    candidateItems.push({
      relativePath: relative,
      fileName: path.basename(relative),
      absolutePath: absolute,
    });
  });
  const autoDigiDecisions: TagDecision[] = [];
  const imageItems: SheetItem[] = [];
  for (const candidate of candidateItems) {
    const autoDigiReason = await resolveAutoDigiReason(
      candidate.absolutePath,
      candidate.fileName
    );
    if (autoDigiReason) {
      autoDigiDecisions.push({
        id: `A${String(autoDigiDecisions.length + 1).padStart(3, "0")}`,
        path: candidate.relativePath,
        file_name: candidate.fileName,
        primary_tag: "DIGI",
        main_subtype: null,
        confidence: 1,
        reason: autoDigiReason,
      });
      continue;
    }
    imageItems.push({
      id: `C${String(imageItems.length + 1).padStart(3, "0")}`,
      index: imageItems.length,
      relativePath: candidate.relativePath,
      fileName: candidate.fileName,
      absolutePath: candidate.absolutePath,
    });
  }

  const limitedItems = imageItems.slice(0, 16);
  if (limitedItems.length === 0) {
    return NextResponse.json({
      ok: true,
      model: null,
      decisions: autoDigiDecisions,
      skippedReason:
        autoDigiDecisions.length > 0
          ? "All valid images were auto-tagged as DIGI."
          : "No valid non-DIGI images to classify.",
    });
  }

  const pathParts = folderPath.split("/").filter(Boolean);
  const productRootRelative =
    pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : folderPath;
  const productRootAbsolute = resolveDraftPath(productRootRelative) || folderAbsolutePath;
  const filesRoot = pickFilesRoot(productRootAbsolute, productRootRelative);

  const taggingRelative = `${filesRoot.relative}/tagging`;
  const taggingAbsolute = path.join(filesRoot.absolute, "tagging");
  fs.mkdirSync(taggingAbsolute, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slugSpu =
    (spu || pathParts[1] || "spu")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "spu";
  const artifactBase = `${slugSpu}-tagsheet-${timestamp}`;

  try {
    const contactSheetBuffer = await buildContactSheet(limitedItems);
    const prompt = buildPrompt({
      spu: spu || pathParts[1] || "",
      variantHints,
      items: limitedItems.map((item) => ({ id: item.id, fileName: item.fileName })),
    });
    const modelResult = await callOpenAiClassifier(prompt, contactSheetBuffer);

    const rawCandidates = Array.isArray(modelResult.parsed.images)
      ? (modelResult.parsed.images as unknown[])
      : [];
    const byId = new Map(limitedItems.map((item) => [item.id, item]));

    const decisions = rawCandidates
      .map((value): TagDecision | null => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const row = value as Record<string, unknown>;
        const id = String(row.id || "").trim().toUpperCase();
        if (!id || !byId.has(id)) return null;
        const primaryCandidate = normalizeTag(row.primary_tag);
        const tag = primaryCandidate.tag;
        const mainSubtype =
          tag === "MAIN"
            ? normalizeMainSubtype(row.main_subtype) || primaryCandidate.mainSubtype
            : null;
        const confidenceRaw = Number(row.confidence);
        const confidence = Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : null;
        const reason = String(row.reason || "").trim();
        const item = byId.get(id)!;
        return {
          id,
          path: item.relativePath,
          file_name: item.fileName,
          primary_tag: tag,
          main_subtype: mainSubtype,
          confidence,
          reason,
        };
      })
      .filter((entry): entry is TagDecision => Boolean(entry));

    const decisionsByPath = new Map(decisions.map((row) => [row.path, row]));
    let normalizedDecisions: TagDecision[] = limitedItems.map((item) => {
      const decided = decisionsByPath.get(item.relativePath);
      if (decided) return decided;
      return {
        id: item.id,
        path: item.relativePath,
        file_name: item.fileName,
        primary_tag: null,
        main_subtype: null,
        confidence: null,
        reason: "No structured classifier output for this tile; left untagged.",
      };
    });

    const mainCandidates = normalizedDecisions
      .filter((row) => row.primary_tag === "MAIN")
      .sort((left, right) => {
        const leftConfidence = typeof left.confidence === "number" ? left.confidence : -1;
        const rightConfidence = typeof right.confidence === "number" ? right.confidence : -1;
        return rightConfidence - leftConfidence;
      });
    const primaryMainId = mainCandidates[0]?.id ?? null;
    if (primaryMainId) {
      normalizedDecisions = normalizedDecisions.map((row) => {
        if (row.primary_tag !== "MAIN" || row.id === primaryMainId) return row;
        return {
          ...row,
          primary_tag: null,
          main_subtype: null,
          reason: row.reason
            ? `${row.reason} (secondary white-background candidate left untagged)`
            : "Secondary white-background candidate left untagged.",
        };
      });
    }

    const combinedDecisions = [...autoDigiDecisions, ...normalizedDecisions];

    const summary = {
      ok: true,
      model: modelResult.model,
      folder_path: folderPath,
      product_root: productRootRelative,
      sheet_layout: {
        images_count: limitedItems.length,
        max_supported: 16,
        tile_size: 350,
        max_sheet_size: "2000x2000",
      },
      auto_tagged_digi_count: autoDigiDecisions.length,
      variant_hints: variantHints,
      decisions: combinedDecisions,
      summary:
        typeof modelResult.parsed.summary === "string"
          ? modelResult.parsed.summary
          : "",
      generated_at: new Date().toISOString(),
    };

    const sheetAbsolute = path.join(taggingAbsolute, `${artifactBase}.jpg`);
    const promptAbsolute = path.join(taggingAbsolute, `${artifactBase}.prompt.txt`);
    const responseAbsolute = path.join(taggingAbsolute, `${artifactBase}.response.txt`);
    const decisionsAbsolute = path.join(taggingAbsolute, `${artifactBase}.decisions.json`);

    fs.writeFileSync(sheetAbsolute, contactSheetBuffer);
    fs.writeFileSync(promptAbsolute, prompt, "utf8");
    fs.writeFileSync(responseAbsolute, modelResult.raw, "utf8");
    fs.writeFileSync(decisionsAbsolute, JSON.stringify(summary, null, 2), "utf8");

    return NextResponse.json({
      ok: true,
      model: summary.model,
      decisions: summary.decisions,
      files: {
        sheet: toRelativePath(sheetAbsolute),
        prompt: toRelativePath(promptAbsolute),
        response: toRelativePath(responseAbsolute),
        decisions: toRelativePath(decisionsAbsolute),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image tagging failed." },
      { status: 500 }
    );
  }
}
