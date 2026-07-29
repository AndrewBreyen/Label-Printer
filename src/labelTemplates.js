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
    height: 238,
  },
};

export const DEFAULT_TEMPLATE_NAME = 'Small Labels';