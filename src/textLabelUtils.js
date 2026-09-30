import { TAPE_WIDTH_PX } from './barcodeUtils';
import {
  getMarkdownContentHeight,
  getMarkdownContentWidth,
  renderMarkdownContent,
} from './markdown';

/** Creates a tape-width canvas sized to fit the widest rendered markdown line. */
export function generateTextCanvas(markdown) {
  if (!markdown.trim()) {
    throw new Error('Enter text to print.');
  }

  const contentWidth = getMarkdownContentWidth(markdown);
  if (contentWidth <= 0) {
    throw new Error('Could not measure the text label.');
  }
  const contentHeight = Math.max(TAPE_WIDTH_PX, getMarkdownContentHeight(markdown));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(contentWidth);
  canvas.height = TAPE_WIDTH_PX;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create a canvas for the text label.');
  }
  context.save();
  if (contentHeight > TAPE_WIDTH_PX) {
    context.scale(1, TAPE_WIDTH_PX / contentHeight);
  }
  renderMarkdownContent(context, markdown, canvas.width, contentHeight);
  context.restore();

  return canvas;
}
