/**
 * drawRulerTicks
 * --------------
 * Draws a top-right-anchored ruler/tick grid onto a canvas context.
 * Shared by:
 *  - the physical "Print Ruler Test" (black ink, drawn full-size)
 *  - the on-screen crop guide overlay on the main label preview
 *    (light gray, stays above the printer's black/white threshold
 *    so it never actually prints as ink)
 *
 * Fixes a label-collision bug from the first version: the horizontal
 * "100" tick label and the vertical "100" tick label used to land
 * almost on top of each other near the top-right corner. Fixed by
 * reserving a corner zone — the vertical scale doesn't print its
 * first label (100) since it falls inside the horizontal scale's
 * label band.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - canvas width
 * @param {number} height - canvas height (how far down to draw)
 * @param {{ color?: string, spacing?: number }} options
 */
export function drawRulerTicks(ctx, width, height, options = {}) {
  const color = options.color ?? '#000000';
  const spacing = options.spacing ?? 20;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.font = 'bold 20px sans-serif';

  // Horizontal ticks — measured from the RIGHT edge inward, so 0 is
  // at the top-right corner. Represents physical label WIDTH in px.
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  for (let d = spacing; d < width; d += spacing) {
    const x = width - d;
    const tickLength = d % 100 === 0 ? 80 : 40;
    ctx.lineWidth = d % 100 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, Math.min(tickLength, height));
    ctx.stroke();
    if (d % 100 === 0) {
      ctx.fillText(String(d), x - 4, tickLength + 4);
    }
  }

  // Vertical ticks — along the RIGHT edge, top (0) to bottom.
  // Represents label HEIGHT (print length) in px. The first labeled
  // tick (100) is intentionally skipped — it falls inside the
  // horizontal scale's label band near the corner and collided with
  // the horizontal "100" label. The tick mark itself still draws,
  // just without a number.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let y = spacing; y < height; y += spacing) {
    const tickLength = y % 100 === 0 ? 80 : 40;
    ctx.lineWidth = y % 100 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(width, y);
    ctx.lineTo(width - Math.min(tickLength, width), y);
    ctx.stroke();
    if (y % 100 === 0 && y > 100) {
      ctx.fillText(String(y), width - tickLength - 8, y);
    }
  }

  ctx.restore();
}
