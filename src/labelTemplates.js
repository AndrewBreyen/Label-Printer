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
    width: 240,
    contentHeight: 220,
    feedHeight: 238,
  },
  'Big Labels': {
    // 2 1/8" x 1 1/8" (54x28mm) labels on the P50S.
    // NOTE: contentHeight (600) is currently LARGER than feedHeight
    // (325) — contentHeight is supposed to be a smaller box WITHIN
    // feedHeight, not bigger than it. This will misbehave the same
    // way Small Labels just did (or worse) if selected as-is. Worth
    // re-running the ruler test for this stock and fixing before use.
    width: 600,
    contentHeight: 600,
    feedHeight: 325,
  },
};

export const DEFAULT_TEMPLATE_NAME = 'Small Labels';