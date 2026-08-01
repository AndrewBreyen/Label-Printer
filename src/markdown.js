/**
 * markdown.js
 * -----------
 * A tiny markdown-inspired layout language for label content, so
 * templates can be written as plain, readable text instead of
 * separate title/subtitle/fontSize/position fields.
 *
 * Syntax:
 *   # Big heading       -> large bold text (H1)
 *   ## Smaller heading   -> medium bold text (H2)
 *   Plain text line      -> regular body text
 *   (blank line)          -> extra vertical spacing between blocks
 *
 * Placeholders (resolved fresh every time it's rendered):
 *   {{now}}        -> current date/time, e.g. "7/29 2:30 PM"
 *   {{now+7d}}     -> date/time 7 days from now (any integer works)
 *   {{nowtime}}    -> current time only, e.g. "2:30 PM" (useful when
 *                     combining a fixed/picked date with a live time)
 *
 * Everything is centered horizontally per line and the whole block
 * of content is centered vertically as a group, then nudged by the
 * xOffset/yOffset fine-tune sliders — same positioning model as
 * before, just driven by parsed markdown instead of fixed fields.
 */

const FONT_SIZES = { h1: 32, h2: 22, body: 16 };
const LINE_HEIGHT_RATIO = 1.3;
const BLANK_LINE_GAP = 10;

function formatDateTime(date) {
  // Compact format that fits a small label: "7/29 2:30 PM"
  const datePart = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Replaces {{now}}, {{now+Nd}}, and {{nowtime}} placeholders with formatted dates/times. */
export function resolvePlaceholders(text) {
  return text
    .replace(/\{\{\s*nowtime\s*\}\}/g, () => formatTimeOnly(new Date()))
    .replace(/\{\{\s*now\s*\}\}/g, () => formatDateTime(new Date()))
    .replace(/\{\{\s*now\s*\+\s*(\d+)\s*d\s*\}\}/g, (_, days) => {
      const d = new Date();
      d.setDate(d.getDate() + Number(days));
      return formatDateTime(d);
    });
}

/** Splits raw markdown text into typed lines (h1 / h2 / body / space). */
export function parseMarkdownLines(markdown) {
  return markdown.split('\n').map((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return { type: 'space' };
    if (trimmed.startsWith('## ')) return { type: 'h2', text: trimmed.slice(3) };
    if (trimmed.startsWith('# ')) return { type: 'h1', text: trimmed.slice(2) };
    return { type: 'body', text: trimmed };
  });
}

/**
 * Renders markdown label content onto a canvas context, filling the
 * boxWidth x boxHeight area (white background + centered text).
 * Placeholders are resolved at render time, so calling this again
 * later (e.g. right before printing) naturally picks up the current
 * date/time without any separate "refresh" step.
 */
export function renderMarkdownContent(ctx, markdown, boxWidth, boxHeight, options = {}) {
  const xOffset = options.xOffset ?? 0;
  const yOffset = options.yOffset ?? 0;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, boxWidth, boxHeight);

  const lines = parseMarkdownLines(markdown);
  const blocks = lines.map((line) => {
    if (line.type === 'space') return { type: 'space', height: BLANK_LINE_GAP };
    const fontSize = FONT_SIZES[line.type];
    return {
      type: line.type,
      text: resolvePlaceholders(line.text),
      fontSize,
      bold: line.type !== 'body',
      height: Math.round(fontSize * LINE_HEIGHT_RATIO),
    };
  });

  const totalHeight = blocks.reduce((sum, b) => sum + b.height, 0);
  let y = (boxHeight - totalHeight) / 2 - yOffset;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = boxWidth / 2 + xOffset;
  const maxTextWidth = boxWidth - 20;

  for (const block of blocks) {
    if (block.type === 'space') {
      y += block.height;
      continue;
    }
    ctx.font = `${block.bold ? 'bold ' : ''}${block.fontSize}px sans-serif`;
    ctx.fillText(block.text, centerX, y + block.height / 2, maxTextWidth);
    y += block.height;
  }
}
