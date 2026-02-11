const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const LOCAL_TINGELO_CATEGORIES_XLSX = path.resolve(__dirname, 'external', 'tingelo_categories.xlsx');
const DEFAULT_TINGELO_CATEGORIES_XLSX =
  process.env.TINGELO_CATEGORIES_XLSX ||
  (fs.existsSync(LOCAL_TINGELO_CATEGORIES_XLSX)
    ? LOCAL_TINGELO_CATEGORIES_XLSX
    : 'D:\\Onedrive\\OneDrive - GadgetBay Limited\\GadgetBay OneDrive Admin\\Supabase Scripts\\Shopify Collections\\tingelo_categories.xlsx');

const TINGELO_CATEGORY_MODEL = process.env.OPENAI_TINGELO_CATEGORY_MODEL || 'gpt-4o';
const TINGELO_CATEGORY_COLUMN = 'category_external_key_shopify_tingelo';

let cachedIndex = null;

function loadTingeloCategoryIndex(xlsxPath = DEFAULT_TINGELO_CATEGORIES_XLSX) {
  if (cachedIndex && cachedIndex.path === xlsxPath) return cachedIndex;
  if (!fs.existsSync(xlsxPath)) {
    return { path: xlsxPath, ok: false, error: 'missing file' };
  }
  try {
    const wb = xlsx.readFile(xlsxPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    const l2List = [];
    const seenL2 = new Set();
    const l2ToCategories = new Map();
    const l2ToSeen = new Map();
    const categoryToExternalKey = new Map();

    for (const r of rows) {
      const l2 = String(r.category_string_L2 || '').trim();
      const cat = String(r.category_string3 || r.category_string_L3 || '').trim();
      const externalKey = String(r.external_key || '').trim();

      if (l2 && !seenL2.has(l2)) {
        l2List.push(l2);
        seenL2.add(l2);
      }

      if (cat) {
        if (externalKey && !categoryToExternalKey.has(cat)) {
          categoryToExternalKey.set(cat, externalKey);
        }
        if (l2) {
          let list = l2ToCategories.get(l2);
          let seen = l2ToSeen.get(l2);
          if (!list) {
            list = [];
            seen = new Set();
            l2ToCategories.set(l2, list);
            l2ToSeen.set(l2, seen);
          }
          if (!seen.has(cat)) {
            list.push(cat);
            seen.add(cat);
          }
        }
      }
    }

    cachedIndex = {
      path: xlsxPath,
      ok: true,
      l2List,
      l2ToCategories,
      categoryToExternalKey
    };
    return cachedIndex;
  } catch (e) {
    return { path: xlsxPath, ok: false, error: e.message || 'read failed' };
  }
}

function normalizeResponseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/^[\s*\-]+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

function parseCategoryResponse(raw, allowedList, allowedSet) {
  if (!raw) return [];
  const lines = String(raw)
    .split(/\r?\n/)
    .map(normalizeResponseLine)
    .filter(Boolean);

  const picked = [];
  const seen = new Set();
  for (const line of lines) {
    if (allowedSet.has(line) && !seen.has(line)) {
      picked.push(line);
      seen.add(line);
      if (picked.length >= 3) break;
    }
  }

  if (picked.length) return picked;

  const text = String(raw);
  for (const cat of allowedList) {
    if (text.includes(cat) && !seen.has(cat)) {
      picked.push(cat);
      seen.add(cat);
      if (picked.length >= 3) break;
    }
  }
  return picked;
}

function extractL1FromCategory(cat) {
  const parts = String(cat || '')
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[0] || '';
}

function tokenizeText(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((t) => t.length > 2);
}

function fillPhase1Categories(selected, allCategories, title, keywords, targetCount) {
  const selectedSet = new Set(selected);
  const tokens = Array.from(new Set([...tokenizeText(title), ...tokenizeText(keywords)]));
  const scored = [];

  for (let i = 0; i < allCategories.length; i++) {
    const cat = allCategories[i];
    if (selectedSet.has(cat)) continue;
    const lower = cat.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) score++;
    }
    scored.push({ cat, score, index: i, l1: extractL1FromCategory(cat) });
  }

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  const out = selected.slice();
  const l1Used = new Set(selected.map(extractL1FromCategory).filter(Boolean));

  for (const item of scored) {
    if (out.length >= targetCount) break;
    if (item.l1 && l1Used.has(item.l1)) continue;
    out.push(item.cat);
    if (item.l1) l1Used.add(item.l1);
  }

  for (const item of scored) {
    if (out.length >= targetCount) break;
    if (selectedSet.has(item.cat)) continue;
    out.push(item.cat);
    selectedSet.add(item.cat);
  }

  return out.slice(0, targetCount);
}

function buildPromptPhase1(title, keywords, categories) {
  return [
    'Step 1: Broad Categorization',
    'Objective: Identify 1-3 broad categories that best fit the product.',
    `Product title: ${title || '(none)'}`,
    `Product keywords: ${keywords || '(none)'}`,
    '',
    'Review the product title and keywords provided.',
    'Select 1 to 3 categories that seem most fitting based on a broad scope.',
    'Avoid over-precision at this stage — if you are unsure, choose wider categories to start the process.',
    'Do not select only one category unless you are absolutely certain it is the only fit.',
    'Prefer different L1/L2 paths; avoid picking multiple L2s within the same L1 unless there are no good alternatives.',
    'Return only the exact category strings, one per line. No extra text.',
    '',
    'Categories:',
    categories.join('\n')
  ].join('\n');
}

function buildPromptPhase2(title, keywords, categories) {
  return [
    'Step 2: Deep Categorization',
    'Objective: Narrow down to the most suitable category by selecting the final product category from the available options.',
    `Product title: ${title || '(none)'}`,
    `Product keywords: ${keywords || '(none)'}`,
    '',
    'After receiving full depth and final nodes from the broad categories selected in Step 1, carefully consider the options.',
    'Choose up to 3 categories, but prioritize the most relevant category.',
    'If only one category fits perfectly, choose just that one.',
    'You are allowed to select multiple categories only if they are all strong matches.',
    'The broad scope in Step 1 does NOT mean you must return multiple final categories.',
    'If no level-3 category is a good fit, you may return a level-2 category from the list.',
    'Do not add an "Other/Övriga" L3 category if a more specific L3 has already been selected within that L2.',
    'It is enough to pick a single L3 within an L2; prioritize multiple categories only when they span different L1/L2 paths.',
    'Return only the exact category strings, one per line. No extra text.',
    '',
    'Categories:',
    categories.join('\n')
  ].join('\n');
}

async function queryCategories(openai, prompt, allowedList, sku, tag, logEvent) {
  if (!openai?.chat?.completions?.create) return [];
  const allowedSet = new Set(allowedList);
  try {
    const resp = await openai.chat.completions.create({
      model: TINGELO_CATEGORY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300
    });
    const raw = resp?.choices?.[0]?.message?.content || '';
    const picked = parseCategoryResponse(raw, allowedList, allowedSet);
    if (logEvent) {
      logEvent({
        sku,
        action: `tingelo-${tag}`,
        status: picked.length ? 'ok' : 'empty',
        extra: picked.join(' | ')
      });
    }
    return picked;
  } catch (e) {
    if (logEvent) {
      logEvent({
        sku,
        action: `tingelo-${tag}`,
        status: 'error',
        reason: e?.message || 'failed'
      });
    }
    return [];
  }
}

function buildPhase2Candidates(selectedL2, index) {
  const out = [];
  const seen = new Set();
  for (const l2 of selectedL2) {
    const list = index.l2ToCategories.get(l2) || [];
    for (const cat of list) {
      if (!seen.has(cat)) {
        out.push(cat);
        seen.add(cat);
      }
    }
  }
  return out;
}

async function enrichRowsWithTingeloCategories(openai, rows, opts = {}) {
  if (!rows?.length) return rows;
  for (const r of rows) {
    if (!(TINGELO_CATEGORY_COLUMN in r)) r[TINGELO_CATEGORY_COLUMN] = '';
  }
  if (!openai?.chat?.completions?.create) {
    return rows;
  }

  const index = loadTingeloCategoryIndex(opts.categoriesPath);
  if (!index.ok) {
    return rows;
  }

  const l2List = index.l2List;
  if (!l2List.length) return rows;
  for (const r of rows) {
    const sku = r.SKU || '';
    const title = String(r.SE_longtitle || '').trim();
    const keywords = String(r.poduct_keywords || r.product_keywords || '').trim();
    if (!title && !keywords) continue;

    const phase1Prompt = buildPromptPhase1(title, keywords, l2List);
    let phase1 = await queryCategories(openai, phase1Prompt, l2List, sku, 'phase1', opts.logEvent);
    if (phase1.length < 3) {
      phase1 = fillPhase1Categories(phase1, l2List, title, keywords, 3);
    }
    if (!phase1.length) continue;

    const phase2Candidates = buildPhase2Candidates(phase1, index);
    let finalCats = phase1;
    if (phase2Candidates.length) {
      const phase2Prompt = buildPromptPhase2(title, keywords, phase2Candidates);
      const phase2 = await queryCategories(openai, phase2Prompt, phase2Candidates, sku, 'phase2', opts.logEvent);
      if (phase2.length) finalCats = phase2;
    }
    const externalKeys = [];
    const seenKeys = new Set();
    for (const cat of finalCats) {
      const key = index.categoryToExternalKey.get(cat);
      if (key && !seenKeys.has(key)) {
        externalKeys.push(key);
        seenKeys.add(key);
      }
      if (externalKeys.length >= 3) break;
    }
    const joined = externalKeys.join('|');
    r[TINGELO_CATEGORY_COLUMN] = joined
      .replace(/\s*\|\s*/g, '|')
      .replace(/\s{2,}/g, '|')
      .trim();
  }

  return rows;
}

module.exports = {
  enrichRowsWithTingeloCategories,
  TINGELO_CATEGORY_COLUMN
};
