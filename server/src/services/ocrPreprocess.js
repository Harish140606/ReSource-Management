// sharp is a native module — load it lazily (like pdf-parse/tesseract.js
// elsewhere in this codebase) so a failed/missing native binary on any given
// environment can't take down the whole server at startup. Only the OCR
// callers depend on this; everything else keeps working either way.
let sharpPromise;
function loadSharp() {
  if (!sharpPromise) sharpPromise = import('sharp').then(m => m.default ?? m);
  return sharpPromise;
}

/**
 * Clean up a scanned/photographed page image before handing it to Tesseract.
 * Grayscale removes color noise, normalize() auto-stretches contrast (helps
 * with dim/uneven lighting from phone photos), and a mild sharpen crisps up
 * small text edges that get blurred during PDF rendering or photo capture.
 * Deliberately no hard black/white threshold — that crushes anti-aliased
 * text edges more often than it helps, especially on phone photos.
 */
export async function preprocessForOcr(buffer) {
  try {
    const sharp = await loadSharp();
    return await sharp(buffer)
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
  } catch {
    // If sharp can't load or process this image for any reason, fall back to
    // the original buffer rather than blocking OCR entirely.
    return buffer;
  }
}
