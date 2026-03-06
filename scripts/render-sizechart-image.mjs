#!/usr/bin/env node
import fs from "fs";
import path from "path";
import sharp from "sharp";

const WIDTH = 1000;
const HEIGHT = 1000;

const normalizeLang = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "sv" || raw === "se" || raw === "swedish") return "se";
  if (raw === "no" || raw === "nb" || raw === "norwegian") return "no";
  if (raw === "en" || raw === "eng" || raw === "english") return "en";
  return "se";
};

const LOCALE_TEXT = {
  se: {
    chartTitle: "Storlekstabell",
    topMeasurements: "Produktmått",
    sizeRecommendation: "Storleksrekommendation",
    fallbackColumn: "Kolumn",
  },
  no: {
    chartTitle: "Storrelsestabell",
    topMeasurements: "Produktmal",
    sizeRecommendation: "Storrelsesanbefaling",
    fallbackColumn: "Kolonne",
  },
  en: {
    chartTitle: "Size Chart",
    topMeasurements: "Product Measurements",
    sizeRecommendation: "Size Recommendation",
    fallbackColumn: "Column",
  },
};

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      out[key] = value;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const fmtNumber = (n) => {
  if (!Number.isFinite(n)) return "-";
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return String(rounded);
};

const isKgColumn = (column) => {
  const key = String(column?.key || "").toLowerCase();
  const label = String(column?.label || "").toLowerCase();
  return key.includes("kg") || label.includes("(kg)") || label.includes(" kg");
};

const formatCell = (value, column) => {
  const roundUpKg = isKgColumn(column);
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    return roundUpKg ? String(Math.ceil(value)) : fmtNumber(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (Number.isFinite(value.min) && Number.isFinite(value.max)) {
      const min = roundUpKg ? Math.ceil(value.min) : fmtNumber(value.min);
      const max = roundUpKg ? Math.ceil(value.max) : fmtNumber(value.max);
      return `${min}-${max}`;
    }
  }
  return String(value);
};

const tableTitle = (table, index, lang) => {
  const type = String(table?.table_type || "").trim();
  const locale = LOCALE_TEXT[lang] || LOCALE_TEXT.se;
  if (type === "top_measurements") return locale.topMeasurements;
  if (type === "size_recommendation") return locale.sizeRecommendation;
  return `Tabell ${index + 1}`;
};

const pickLocalizedLabel = (column, lang) => {
  const keyForLang = `label_${lang}`;
  const candidates = [
    column?.[keyForLang],
    column?.label_sv,
    column?.label_se,
    column?.label_no,
    column?.label_en,
    column?.label,
    column?.key,
  ];
  const label = candidates
    .map((value) => String(value ?? "").trim())
    .find((value) => value.length > 0);
  if (label) return label;
  return (LOCALE_TEXT[lang] || LOCALE_TEXT.se).fallbackColumn;
};

const buildTables = (payload, lang) => {
  const tables = Array.isArray(payload?.tables) ? payload.tables : [];
  return tables
    .filter((t) => Array.isArray(t?.columns) && t.columns.length > 0 && Array.isArray(t?.rows))
    .slice(0, 2)
    .map((t, idx) => {
      const columns = t.columns.map((c) => ({
        key: String(c?.key || ""),
        label: pickLocalizedLabel(c, lang),
      }));
      const rows = t.rows.map((row) =>
        columns.map((c) => formatCell(row?.[c.key], c))
      );

      const lens = columns.map((c, ci) => {
        let maxLen = c.label.length;
        for (const row of rows) {
          maxLen = Math.max(maxLen, String(row[ci] ?? "").length);
        }
        return Math.max(5, maxLen + 2);
      });

      const sum = lens.reduce((a, b) => a + b, 0);
      const weights = lens.map((len) => len / sum);

      return {
        title: tableTitle(t, idx, lang),
        columns,
        rows,
        weights,
      };
    });
};

const renderSvg = ({ tables, notes, lang }) => {
  const locale = LOCALE_TEXT[lang] || LOCALE_TEXT.se;
  const margin = 44;
  const innerX = margin;
  const innerY = margin;
  const innerW = WIDTH - margin * 2;
  const innerH = HEIGHT - margin * 2;

  const titleFont = 44;
  const sectionTitleFont = 26;
  const headFont = 23;
  const bodyFont = 22;
  const noteFont = 18;

  const titleH = 62;
  const gapAfterTitle = 16;
  const sectionGap = 18;
  const topPad = 10;
  const tableHeaderH = 50;
  const rowH = 48;
  const lineW = 2;

  const rowsCountTotal = tables.reduce((sum, t) => sum + t.rows.length, 0);
  const sectionTitleTotal = tables.length * 34;
  const fixed = titleH + gapAfterTitle + sectionGap * Math.max(0, tables.length - 1) + sectionTitleTotal + topPad * tables.length + tableHeaderH * tables.length + 24;
  const remainingForRows = innerH - fixed - 60;
  const dynamicRowH = Math.max(34, Math.min(rowH, Math.floor(remainingForRows / Math.max(1, rowsCountTotal))));

  let y = innerY;
  const chunks = [];

  chunks.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`);
  chunks.push(`<text x="${innerX}" y="${y + titleH - 10}" font-family="Arial, Helvetica, sans-serif" font-size="${titleFont}" font-weight="700" fill="#000">${escapeXml(locale.chartTitle)}</text>`);
  y += titleH + gapAfterTitle;

  for (let ti = 0; ti < tables.length; ti += 1) {
    const t = tables[ti];

    chunks.push(`<text x="${innerX}" y="${y + 24}" font-family="Arial, Helvetica, sans-serif" font-size="${sectionTitleFont}" font-weight="700" fill="#000">${escapeXml(t.title)}</text>`);
    y += 34;

    const tableY = y + topPad;
    const rows = t.rows.length;
    const tableH = tableHeaderH + rows * dynamicRowH;

    chunks.push(`<rect x="${innerX}" y="${tableY}" width="${innerW}" height="${tableH}" fill="#fff" stroke="#000" stroke-width="${lineW}"/>`);
    chunks.push(`<rect x="${innerX}" y="${tableY}" width="${innerW}" height="${tableHeaderH}" fill="#f2f2f2" stroke="none"/>`);

    let cx = innerX;
    const colWidths = t.weights.map((w, i) => {
      if (i === t.weights.length - 1) return innerX + innerW - cx;
      const ww = Math.round(innerW * w);
      const minW = 120;
      const used = Math.max(minW, ww);
      return used;
    });

    const colSum = colWidths.reduce((a, b) => a + b, 0);
    if (colSum !== innerW) {
      colWidths[colWidths.length - 1] += innerW - colSum;
    }

    for (let i = 0; i < colWidths.length; i += 1) {
      if (i > 0) {
        chunks.push(`<line x1="${cx}" y1="${tableY}" x2="${cx}" y2="${tableY + tableH}" stroke="#000" stroke-width="${lineW}"/>`);
      }
      const label = t.columns[i]?.label ?? "";
      chunks.push(`<text x="${cx + colWidths[i] / 2}" y="${tableY + 33}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${headFont}" font-weight="700" fill="#000">${escapeXml(label)}</text>`);
      cx += colWidths[i];
    }

    for (let r = 0; r < rows; r += 1) {
      const rowTop = tableY + tableHeaderH + r * dynamicRowH;
      chunks.push(`<line x1="${innerX}" y1="${rowTop}" x2="${innerX + innerW}" y2="${rowTop}" stroke="#000" stroke-width="1.5"/>`);
      let x = innerX;
      for (let c = 0; c < colWidths.length; c += 1) {
        const text = t.rows[r]?.[c] ?? "-";
        chunks.push(`<text x="${x + colWidths[c] / 2}" y="${rowTop + Math.floor(dynamicRowH * 0.66)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${bodyFont}" fill="#000">${escapeXml(text)}</text>`);
        x += colWidths[c];
      }
    }

    y = tableY + tableH;
    if (ti < tables.length - 1) y += sectionGap;
  }

  const noteY = Math.min(innerY + innerH - 10, y + 36);
  if (notes.length > 0) {
    const noteText = notes.slice(0, 1)[0];
    chunks.push(`<text x="${innerX}" y="${noteY}" font-family="Arial, Helvetica, sans-serif" font-size="${noteFont}" fill="#000">${escapeXml(noteText)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${chunks.join("")}</svg>`;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(String(args.input || ""));
  const outputPath = path.resolve(String(args.output || ""));
  const lang = normalizeLang(args.lang);

  if (!inputPath || !outputPath) {
    throw new Error("Usage: node scripts/render-sizechart-image.mjs --input <sizechart.json> --output <out.jpg> --spu <SPU>");
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const tables = buildTables(payload, lang);
  if (tables.length === 0) {
    throw new Error("No usable tables found in JSON.");
  }

  const notesKey = `sizing_info_${lang}`;
  const notesSource =
    payload?.[notesKey] ??
    payload?.sizing_info_sv ??
    payload?.sizing_info_se ??
    payload?.sizing_info_en ??
    [];
  const notes = Array.isArray(notesSource)
    ? notesSource.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const svg = renderSvg({ tables, notes, lang });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(outputPath);

  process.stdout.write(`${outputPath}\n`);
};

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
