/**
 * labelTemplates.js
 * -----------------
 * Named label-size presets. Each template holds the calibrated
 * content box width and print length (height) for a specific
 * physical label size, determined via the "Print Ruler Test" button
 * in the app and dialed in against real printed output.
 *
 * To add a new label size: print the ruler test, read off the real
 * width/height in px for that stock, and add an entry here.
 */
export const LABEL_TEMPLATES = {
  'Small Labels': {
    // 1 3/8" x 1 3/8" (35x35mm) labels on the P50S.
    // Width and height were calibrated SEPARATELY — this printer's
    // print head resolution (width) and feed-motor resolution
    // (height) turned out not to share the same px-per-mm scale.
    width: 260,
    // contentHeight: the top-anchored box text is actually
    // positioned/cropped within (what you see in the preview).
    contentHeight: 205,
    // feedHeight: the FULL print job height sent to the printer —
    // must stay this size regardless of contentHeight, since it's
    // the exact physical distance needed to reach the next label's
    // boundary. The gap between contentHeight and feedHeight is
    // just blank continued feed, not shown in the cropped preview.
    feedHeight: 238,
  },
  'Big Labels': {
    // 2 1/8" x 1 1/8" (54x28mm) labels on the P50S.
    width: 600,
    contentHeight: 600,
    feedHeight: 325,
  },
};

export const DEFAULT_TEMPLATE_NAME = 'Small Labels';