import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

// ── Fuzzy category matching (client port of the server's disposalMatch logic) ──
// Real-world spreadsheets have typos/abbreviations ("Gneral", "Aliminium") and
// label vs. code mismatches, so header text is matched tolerantly rather than
// requiring an exact string match against Reference Data.
const STOPWORDS = new Set([
  'waste', 'scrap', 'and', 'the', 'of', 'with', 'general', 'damaged', 'used', 'spent',
  'wastes', 'residues', 'residue', 'empty', 'contaminated', 'kgs', 'kg', 'nos',
]);
const SYNONYMS = { '&': 'and', plywood: 'wooden', ply: 'wooden', pallets: 'pallet', cartons: 'carton', plastics: 'plastic', gneral: 'general', aliminium: 'aluminium' };

function tokenize(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(t => SYNONYMS[t] ?? t)
    .filter(t => t && !STOPWORDS.has(t));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

function tokenSim(a, b) {
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const sim = 1 - dist / Math.max(a.length, b.length);
  return sim >= 0.75 ? sim : 0;
}

function score(headerTokens, nameTokens) {
  if (!headerTokens.length || !nameTokens.length) return 0;
  let matched = 0;
  for (const nt of nameTokens) {
    let best = 0;
    for (const ht of headerTokens) best = Math.max(best, tokenSim(ht, nt));
    matched += best;
  }
  const recall = matched / nameTokens.length;
  const precision = matched / headerTokens.length;
  return recall * 0.7 + precision * 0.3;
}

const MATCH_THRESHOLD = 0.6;

/** Best-guess a Reference Data category for a raw column header. */
export function matchCategoryHeader(headerText, allCategories) {
  const headerTokens = tokenize(headerText);
  let best = null;
  for (const cat of allCategories) {
    const s = Math.max(score(headerTokens, tokenize(cat.code)), score(headerTokens, tokenize(cat.label)));
    if (!best || s > best.confidence) best = { category: cat, confidence: s };
  }
  if (!best || best.confidence < MATCH_THRESHOLD) return { category: null, confidence: best?.confidence ?? 0 };
  return best;
}

// ── Pivot sheet extraction ──────────────────────────────────────────────────
// Locates the sub-header row (the one whose first cell is "Date") dynamically
// rather than assuming a fixed row number, since real-world files may have an
// extra title/index row above the category headers.
function findHeaderRows(sheetRows) {
  for (let r = 0; r < Math.min(sheetRows.length, 10); r++) {
    const first = sheetRows[r]?.[0];
    if (first && String(first).trim().toLowerCase() === 'date') {
      return { subHeaderRow: r, categoryRow: r - 1 };
    }
  }
  return null;
}

function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD');
  if (typeof value === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return dayjs(`${d.y}-${d.m}-${d.d}`, 'YYYY-M-D').format('YYYY-MM-DD');
  }
  const str = String(value).trim();
  const parsed = dayjs(str, ['DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

/**
 * Extract { date, headerText, waste_for_day }[] from one pivot-style sheet
 * (category name merged across 4 columns: Opening/Waste/Disposal/Closing).
 */
function extractSheetRows(sheetRows) {
  const headerRows = findHeaderRows(sheetRows);
  if (!headerRows || headerRows.categoryRow < 0) return [];
  const { subHeaderRow, categoryRow } = headerRows;

  const catNameRow = sheetRows[categoryRow] || [];
  const subLabelRow = sheetRows[subHeaderRow] || [];

  // Each category occupies a contiguous block starting at its named column;
  // within that block, find whichever sub-column is actually labeled "waste".
  const blocks = [];
  catNameRow.forEach((val, col) => {
    if (col === 0 || !val) return;
    let wasteCol = col + 1; // default per our own pivot convention
    for (let c = col; c < Math.min(col + 4, subLabelRow.length); c++) {
      if (String(subLabelRow[c] || '').toLowerCase().includes('waste')) { wasteCol = c; break; }
    }
    blocks.push({ headerText: String(val).replace(/\s*\([^)]*\)\s*$/g, '').trim(), wasteCol });
  });

  const out = [];
  for (let r = subHeaderRow + 1; r < sheetRows.length; r++) {
    const row = sheetRows[r];
    if (!row || !row[0]) continue;
    const date = parseExcelDate(row[0]);
    if (!date) continue;
    blocks.forEach(b => {
      const waste = Number(row[b.wasteCol]);
      if (Number.isFinite(waste) && waste > 0) {
        out.push({ date, headerText: b.headerText, waste_for_day: waste });
      }
    });
  }
  return out;
}

/** Read a File (.xlsx) and return raw { date, headerText, waste_for_day } rows across all sheets. */
export async function readPivotWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    rows.push(...extractSheetRows(data));
  }
  return rows;
}

/**
 * Resolve each raw row's category against Reference Data (fuzzy match),
 * splitting into resolved rows and an unmatched list (header text + dates affected).
 */
export function resolveRows(rawRows, allCategories) {
  const resolved = [];
  const unmatchedMap = new Map(); // headerText -> { headerText, dates: Set }
  const matchCache = new Map();

  for (const row of rawRows) {
    let m = matchCache.get(row.headerText);
    if (!m) {
      m = matchCategoryHeader(row.headerText, allCategories);
      matchCache.set(row.headerText, m);
    }
    if (!m.category) {
      const key = row.headerText;
      if (!unmatchedMap.has(key)) unmatchedMap.set(key, { headerText: key, dates: new Set() });
      unmatchedMap.get(key).dates.add(row.date);
      continue;
    }
    resolved.push({
      date: row.date,
      category: m.category.code,
      label: m.category.label,
      waste_type: m.category.metadata?.waste_type,
      source: m.category.metadata?.source, // 'BAT' | 'SOFT' | 'BOTH'
      weight_kg: row.waste_for_day,
    });
  }

  const unmatched = [...unmatchedMap.values()].map(u => ({ headerText: u.headerText, dateCount: u.dates.size }));
  return { resolved, unmatched };
}

/**
 * Group resolved rows into one declaration draft per (date, source). Only
 * groups that end up with at least one item are returned — a date with
 * nothing declared produces no declaration.
 */
export function groupIntoDeclarations(resolved, sourceOverrides = {}) {
  const groups = new Map(); // 'date|source' -> { date, source, items: [] }

  for (const row of resolved) {
    let source = row.source;
    if (source === 'BOTH') source = sourceOverrides[row.category] || 'SOFT';
    const key = `${row.date}|${source}`;
    if (!groups.has(key)) groups.set(key, { date: row.date, source, items: [] });
    groups.get(key).items.push({
      category: row.category,
      label: row.label,
      waste_type: row.waste_type,
      weight_kg: row.weight_kg,
      bat_id: '',
    });
  }

  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
}

/** Category codes whose source is ambiguous ('BOTH') and need a manual choice. */
export function ambiguousCategories(resolved) {
  const map = new Map();
  for (const row of resolved) {
    if (row.source === 'BOTH' && !map.has(row.category)) map.set(row.category, row.label);
  }
  return [...map.entries()].map(([category, label]) => ({ category, label }));
}
