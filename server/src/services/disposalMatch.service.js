import { ALL_CATEGORIES } from '../constants/wasteCategories.js';

// Words that carry no discriminating value when matching invoice text to a category.
const STOPWORDS = new Set([
  'waste', 'scrap', 'and', 'the', 'of', 'with', 'general', 'damaged', 'used', 'spent',
  'wastes', 'residues', 'residue', 'empty', 'contaminated',
]);

// Common invoice spellings → canonical token (helps "&" vs "and", "plywood" vs "wooden", etc.)
const SYNONYMS = {
  '&': 'and',
  'plywood': 'wooden',
  'ply': 'wooden',
  'pallets': 'pallet',
  'cartons': 'carton',
  'plastics': 'plastic',
};

function tokenize(str) {
  return str
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
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

// Fuzzy token similarity 0..1 (1 = identical, allows minor spelling differences).
function tokenSim(a, b) {
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const sim = 1 - dist / maxLen;
  return sim >= 0.8 ? sim : 0; // only count tokens that are nearly equal
}

// Score how well an invoice description matches a category name (0..1).
function score(invoiceTokens, categoryTokens) {
  if (!invoiceTokens.length || !categoryTokens.length) return 0;
  let matched = 0;
  for (const ct of categoryTokens) {
    let best = 0;
    for (const it of invoiceTokens) best = Math.max(best, tokenSim(it, ct));
    matched += best;
  }
  // Recall over the category's tokens, lightly weighted by invoice coverage.
  const recall = matched / categoryTokens.length;
  const precision = matched / invoiceTokens.length;
  return recall * 0.7 + precision * 0.3;
}

const THRESHOLD = 0.6;

/**
 * Best-guess a canonical category + waste_type for a raw invoice material description.
 * Returns { category, waste_type, confidence } or { category: null, ... } when nothing
 * scores above the threshold.
 */
export function matchCategory(description) {
  const invoiceTokens = tokenize(description);
  let best = null;
  for (const { category, waste_type } of ALL_CATEGORIES) {
    const s = score(invoiceTokens, tokenize(category));
    if (!best || s > best.confidence) best = { category, waste_type, confidence: s };
  }
  if (!best || best.confidence < THRESHOLD) {
    return { category: null, waste_type: null, confidence: best?.confidence ?? 0 };
  }
  return best;
}
