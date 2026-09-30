/**
 * barcodeUtils.js
 * ---------------
 * CODE128 barcode generation for the label printer, via the
 * `jsbarcode` package (latest as of writing: 3.12.3).
 *
 * Barcodes are drawn ROTATED 90° so the bar-HEIGHT axis (normally
 * the short dimension) fills the full width of the 15mm continuous
 * tape, and the bar SEQUENCE (normally the long dimension) runs
 * along the tape's feed direction instead. In other words: the code
 * prints "vertically" — reading down the length of the label as it
 * feeds out — rather than across the narrow 15mm width.
 *
 * Usage pattern (see App.js):
 *   const barcodeCanvas = generateBarcodeCanvas(value, TAPE_WIDTH_PX);
 *   // size your destination canvas: width = TAPE_WIDTH_PX, height = barcodeCanvas.width
 *   drawRotatedBarcode(ctx, barcodeCanvas);
 */
import JsBarcode from 'jsbarcode';

/**
 * 15mm continuous roll stock, calibrated at 8px/mm (matches the
 * printer's confirmed physical calibration — see ble-protocol notes).
 */
export const PX_PER_MM = 8;
export const TAPE_WIDTH_MM = 15;
export const TAPE_WIDTH_PX = TAPE_WIDTH_MM * PX_PER_MM; // 120px
export const BARCODE_SIDE_MARGIN_PX = 0;
export const BARCODE_HEIGHT_PX = TAPE_WIDTH_PX;

/** Continuous-roll paper type (as opposed to gap/die-cut labels). */
export const CONTINUOUS_PAPER_TYPE = 0x10;

/**
 * Generates a CODE128 barcode for `value` on a new offscreen canvas
 * (not attached to the DOM — JsBarcode works fine against a
 * detached canvas), sized so the bars are exactly `tapeWidthPx`
 * tall. That becomes the tape-filling dimension once rotated; the
 * canvas's resulting WIDTH (bar sequence + quiet zone) becomes the
 * print length.
 *
 * `marginTop`/`marginBottom` are forced to 0 so canvas.height comes
 * out to exactly `tapeWidthPx` — no unaccounted-for padding that
 * would keep the barcode from filling the tape edge-to-edge.
 * `quietZonePx` still pads the left/right (i.e. leading/trailing,
 * once rotated) so a scanner has clear space to lock onto the code.
 *
 * Throws if `value` can't be encoded as CODE128 (e.g. empty string).
 */
export function generateBarcodeCanvas(value, tapeWidthPx = TAPE_WIDTH_PX, options = {}) {
  const {
    barWidth = 2, // shortest module to test with the printer's low-speed mode
    quietZonePx = 0, // minimum possible length; surrounding tape supplies any quiet zone
    displayValue = false,
  } = options;
  // Code 128C stores two digits per symbol, making numeric IDs much shorter
  // without reducing their scan quality. Odd-length numeric values use the
  // automatic encoder because Code 128C requires pairs of digits.
  const format = /^\d+$/.test(value) && value.length % 2 === 0 ? 'CODE128C' : 'CODE128';

  const canvas = document.createElement('canvas');
  let ok = true;

  JsBarcode(canvas, value, {
    format,
    width: barWidth,
    height: tapeWidthPx,
    margin: 0,
    marginLeft: quietZonePx,
    marginRight: quietZonePx,
    displayValue,
    background: '#ffffff',
    lineColor: '#000000',
    valid: (isValid) => {
      ok = isValid;
    },
  });

  if (!ok) {
    throw new Error(`"${value}" can't be encoded as CODE128.`);
  }

  return canvas; // canvas.width = print length in px, canvas.height = tapeWidthPx
}

/**
 * Draws an already-generated barcode canvas (from
 * generateBarcodeCanvas) into `ctx`, rotated 90° clockwise, so its
 * height becomes the destination's width (filling the tape) and its
 * width becomes the destination's height (the print length).
 *
 * Assumes ctx's origin (0,0) is already the top-left corner of the
 * area to draw into (translate before calling, if needed — same
 * convention as renderMarkdownContent).
 */
export function drawRotatedBarcode(ctx, barcodeCanvas) {
  drawRotatedCanvas(ctx, barcodeCanvas);
}

/** Draws a canvas rotated 90° clockwise into its destination context. */
export function drawRotatedCanvas(ctx, sourceCanvas) {
  ctx.save();
  // A 90-degree rotation should be a pixel-for-pixel transpose. Explicitly
  // disable interpolation so the printer receives only crisp black/white
  // modules rather than gray edge pixels.
  ctx.imageSmoothingEnabled = false;
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sourceCanvas, 0, -sourceCanvas.height);
  ctx.restore();
}
