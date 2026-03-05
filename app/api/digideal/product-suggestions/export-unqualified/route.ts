import ExcelJS from "exceljs";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const THUMBNAIL_SIZE_PX = 70;
const ROW_HEIGHT_POINTS = 56.25; // 75 px at 96 DPI
const MAX_EXPORT_ROWS = 1000;

type ExportRequestRow = {
  id: string;
  reviewStatus: "new" | "unqualified";
  thumbnailUrl: string | null;
  title: string;
  sourceUrl: string | null;
  createdAt: string | null;
  taxonomyPath: string;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeSuggestionReviewStatus = (value: unknown): "new" | "unqualified" =>
  asText(value).toLowerCase() === "unqualified" ? "unqualified" : "new";

const toAbsoluteHttpUrl = (request: Request, value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (!raw.startsWith("/")) return "";
  try {
    const base = new URL(request.url).origin;
    return new URL(raw, base).toString();
  } catch {
    return "";
  }
};

const formatDateTime = (value: string | null) => {
  const raw = asText(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad2 = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
};

const formatTimestamp = () => {
  const now = new Date();
  const pad2 = (num: number) => String(num).padStart(2, "0");
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(
    now.getHours()
  )}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
};

const parseRequestRows = (value: unknown): ExportRequestRow[] => {
  if (!Array.isArray(value)) return [];
  const out: ExportRequestRow[] = [];
  for (const entry of value) {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    if (!row) continue;
    const id = asText(row.id);
    if (!id) continue;
    out.push({
      id,
      reviewStatus: normalizeSuggestionReviewStatus(
        row.review_status ?? row.reviewStatus ?? row.status
      ),
      thumbnailUrl: asText(row.thumbnail_url ?? row.thumbnailUrl) || null,
      title: asText(row.title) || id,
      sourceUrl: asText(row.source_url ?? row.sourceUrl) || null,
      createdAt: asText(row.created_at ?? row.createdAt) || null,
      taxonomyPath: asText(row.taxonomy_path ?? row.taxonomyPath),
    });
    if (out.length >= MAX_EXPORT_ROWS) break;
  }
  return out;
};

const renderImageCell = async (
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  imageUrl: string
) => {
  if (!imageUrl) return;
  try {
    const response = await fetch(imageUrl, { redirect: "follow" });
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    const src = Buffer.from(arrayBuffer);
    if (!src.length) return;

    const fitted = await sharp(src)
      .resize({
        width: THUMBNAIL_SIZE_PX,
        height: THUMBNAIL_SIZE_PX,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: true,
      })
      .png({ quality: 92 })
      .toBuffer();

    const imageId = workbook.addImage({
      base64: `data:image/png;base64,${fitted.toString("base64")}`,
      extension: "png",
    });

    sheet.addImage(imageId, {
      tl: { col: 0, row: rowIndex - 1 },
      ext: { width: THUMBNAIL_SIZE_PX, height: THUMBNAIL_SIZE_PX },
      editAs: "oneCell",
    });
  } catch {
    // Best-effort image embedding only.
  }
};

async function requireSignedIn() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, user };
}

export async function POST(request: Request) {
  const auth = await requireSignedIn();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const rows = parseRequestRows(
    body && typeof body === "object" ? (body as Record<string, unknown>).rows : null
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "No unqualified products selected." }, { status: 400 });
  }

  if (rows.some((row) => row.reviewStatus !== "unqualified")) {
    return NextResponse.json(
      { error: "Export Unqualified only supports rows marked as Unqualified." },
      { status: 400 }
    );
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Unqualified Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Thumbnail", key: "thumbnail", width: 12 },
    { header: "Title", key: "title", width: 48 },
    { header: "Source URL", key: "source_url", width: 56 },
    { header: "Date Added", key: "date_added", width: 22 },
    { header: "Google Taxonomy", key: "taxonomy", width: 52 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  header.height = 24;

  for (let index = 0; index < rows.length; index += 1) {
    const rowIndex = index + 2;
    const rowData = rows[index];

    sheet.addRow({
      thumbnail: "",
      title: rowData.title,
      source_url: rowData.sourceUrl || "",
      date_added: formatDateTime(rowData.createdAt),
      taxonomy: rowData.taxonomyPath,
    });

    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    row.alignment = {
      vertical: "middle",
      horizontal: "right",
      wrapText: true,
    };

    const sourceUrl = asText(rowData.sourceUrl);
    if (sourceUrl) {
      const sourceCell = sheet.getCell(`C${rowIndex}`);
      sourceCell.value = {
        text: sourceUrl,
        hyperlink: sourceUrl,
      };
      sourceCell.font = { color: { argb: "FF1F5FBF" }, underline: true };
    }

    const imageUrl = toAbsoluteHttpUrl(request, rowData.thumbnailUrl);
    await renderImageCell(workbook, sheet, rowIndex, imageUrl);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  const filename = `Unqualified Products_${formatTimestamp()}.xlsx`;
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

