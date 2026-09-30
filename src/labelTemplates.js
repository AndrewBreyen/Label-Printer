/**
 * labelTemplates.js
 * -----------------
 * Config for the app's one supported label size: a 15mm-wide
 * continuous roll. There's no gap sensor to calibrate against on
 * continuous stock, so only the width is fixed — print length is calculated
 * from the content on each label.
 *
 * CONTENT_WIDTH and PX_PER_MM are ESTIMATES based on a common
 * 203dpi thermal print head (203/25.4 ≈ 8px/mm). Verify against your
 * actual printer using the "Print Ruler Test" button and adjust
 * these two numbers if the printed label doesn't come out at 15mm.
 */
export const PX_PER_MM = 8; // 203dpi ≈ 8px/mm — recalibrate against a ruler test if needed
export const CONTENT_WIDTH = Math.round(15 * PX_PER_MM); // ~120px for a 15mm-wide label
export const MIN_LENGTH_MM = 8; // shortest label the UI will let you set
export const POST_PRINT_FEED_MM = 2; // extra unprinted stock to advance after each label

/**
 * PRINT_OFFSET_PX — shifts the content block within the printer's
 * 384-dot line, to line it up with where the 15mm tape actually
 * sits under the print head.
 *
 * Content was previously flush against the canvas's right edge
 * (CONTENT_LEFT = LABEL_WIDTH - CONTENT_WIDTH), which is already the
 * max possible value before the block runs off the canvas — so
 * there was no room to shift it further in that direction. The
 * ruler test showed the printed text clipped on its left edge (the
 * leading letter of each line missing), meaning the tape's usable
 * area sits a bit further over than that flush-right position
 * assumed.
 *
 * This is a starting guess (~5mm worth of shift) — re-run the Print
 * Ruler Test after this change and increase/decrease it until the
 * full line, start to finish, lands cleanly on the tape.
 */
export const PRINT_OFFSET_PX = -10;

// Named physical-label presets used by the label-size selector in App.js.
// Continuous barcode mode sizes its canvases independently.
export const LABEL_TEMPLATES = {
  'Small Labels': {
    width: 240,
    contentHeight: 220,
    feedHeight: 238,
  },
  'Big Labels': {
    width: 600,
    contentHeight: 600,
    feedHeight: 325,
  },
};

export const DEFAULT_TEMPLATE_NAME = 'Small Labels';