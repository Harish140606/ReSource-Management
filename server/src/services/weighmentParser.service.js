import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { preprocessForOcr } from './ocrPreprocess.js';

// Same bundled Tesseract language data used by disposalParser.service.js.
const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let PDFParsePromise;
function loadPdfParse() {
  if (!PDFParsePromise) PDFParsePromise = import('pdf-parse').then(m => m.PDFParse);
  return PDFParsePromise;
}
let TesseractPromise;
function loadTesseract() {
  if (!TesseractPromise) TesseractPromise = import('tesseract.js').then(m => m.default ?? m);
  return TesseractPromise;
}

// A weighment certificate is scattered labeled fields (not a dense paragraph
// or table), closer to a form than a block of prose — PSM 11 ("sparse text")
// is built for finding text like that without assuming a uniform layout.
const WEIGHMENT_PSM = '11';

async function recognizeWithPsm(Tesseract, buffer, psm) {
  const worker = await Tesseract.createWorker('eng', 1, {
    langPath: SERVER_ROOT,
    gzip: false,
    cacheMethod: 'none',
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(buffer);
    return data;
  } finally {
    await worker.terminate();
  }
}

async function ocrBuffer(buffer) {
  const Tesseract = await loadTesseract();
  const cleaned = await preprocessForOcr(buffer);
  const data = await recognizeWithPsm(Tesseract, cleaned, WEIGHMENT_PSM);
  return data.text;
}

// Render each PDF page to a high-resolution image and OCR it (scanned PDF certificates).
async function ocrPdf(buffer) {
  const PDFParse = await loadPdfParse();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let text = '';
  try {
    const shot = await parser.getScreenshot({ scale: 4.5 });
    for (const page of shot.pages ?? []) {
      const b64 = (page.dataUrl || '').split(',')[1];
      if (!b64) continue;
      text += (await ocrBuffer(Buffer.from(b64, 'base64'))) + '\n';
    }
  } finally {
    await parser.destroy();
  }
  return text;
}

function num(str) {
  if (str == null) return null;
  const n = Number(String(str).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function firstMatch(text, re) {
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

// Weighbridge certificates are bilingual (English label + Tamil sub-label) —
// strip the Tamil block so English-anchored regexes don't snag on it.
function stripTamil(text) {
  return text.replace(/[஀-௿]+/g, ' ');
}

function parseWeighmentText(rawText) {
  const text = stripTamil(rawText);

  const serial_no = firstMatch(text, /S\.?\s*No\.?\s*[:\s]*?(\d{4,})/i);
  const vehicleRaw = firstMatch(text, /\b([A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4})\b/);
  const vehicle_no = vehicleRaw ? vehicleRaw.replace(/\s+/g, '').toUpperCase() : null;
  const material = firstMatch(text, /Material\s*[:\s]*\n?\s*([A-Za-z][A-Za-z /]+?)(?:\n|Gross)/i);
  const gross_kg = num(firstMatch(text, /Gross\s*[:\s]*\n?\s*([\d,]+(?:\.\d+)?)\s*Kg/i));
  const tare_kg  = num(firstMatch(text, /Tare\s*[:\s]*\n?\s*([\d,]+(?:\.\d+)?)\s*Kg/i));
  const net_kg   = num(firstMatch(text, /Nett?\s*[:\s]*\n?\s*([\d,]+(?:\.\d+)?)\s*Kg/i));
  const customer = firstMatch(text, /Customer\s*[:\s]*\n?\s*([A-Za-z][A-Za-z .&]+?)(?:\n|Customer Signature)/i);
  const date_raw = firstMatch(text, /(\d{2}\/\d{2}\/\d{4})/);
  const date = date_raw ? `${date_raw.slice(6, 10)}-${date_raw.slice(3, 5)}-${date_raw.slice(0, 2)}` : null;
  const time = firstMatch(text, /(\d{2}:\d{2}:\d{2})/);

  return {
    serial_no,
    vehicle_no,
    material: material?.trim() || null,
    gross_kg,
    tare_kg,
    net_kg,
    customer: customer?.trim() || null,
    date,
    time,
  };
}

/**
 * OCR a weighbridge weighment certificate (photo/scan, image or PDF) and
 * extract vehicle/weight fields. Nothing is persisted here — the caller
 * reviews/edits the result before saving it on the disposal invoice.
 */
export async function parseWeighmentCertificate(buffer, mimetype) {
  let text = '';

  if (mimetype === 'application/pdf') {
    try {
      const PDFParse = await loadPdfParse();
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      text = (await parser.getText()).text || '';
      await parser.destroy();
    } catch {
      text = '';
    }
    if (text.replace(/[^A-Za-z0-9]/g, '').length < 30) {
      text = await ocrPdf(buffer);
    }
  } else {
    text = await ocrBuffer(buffer);
  }

  const parsed = parseWeighmentText(text);
  // Never hard-fail: even a partial/garbled OCR read still lets the user fill
  // in the rest by hand. `matched` tells the client whether anything useful
  // was actually found, so it can show a gentle "couldn't auto-read" note
  // instead of blocking the form.
  const matched = !!(parsed.vehicle_no || parsed.gross_kg != null || parsed.tare_kg != null || parsed.net_kg != null);

  return { ...parsed, matched, raw_text: text };
}
