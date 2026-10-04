import { getMarkdownContentHeight, renderMarkdownContent } from './markdown';

describe('markdown text wrapping', () => {
  const context = {
    measureText: jest.fn((text) => ({ width: text.length * 10 })),
    fillRect: jest.fn(),
    fillText: jest.fn(),
  };

  beforeEach(() => {
    context.measureText.mockImplementation((text) => ({ width: text.length * 10 }));
    jest.spyOn(document, 'createElement').mockImplementation(() => ({
      getContext: () => context,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('wraps words instead of compressing a line to fit', () => {
    const contentHeight = getMarkdownContentHeight('one two', 70);
    expect(contentHeight).toBe(46);

    renderMarkdownContent(context, 'one two', 70, contentHeight);

    expect(context.fillText).toHaveBeenNthCalledWith(1, 'one', 35, 11.5, 50);
    expect(context.fillText).toHaveBeenNthCalledWith(2, 'two', 35, 34.5, 50);
  });

  test('renders receipt text in monospace and uses larger body text', () => {
    renderMarkdownContent(context, 'receipt body', 384, 100, { fontFamily: 'monospace' });

    expect(context.font).toBe('18px monospace');
  });
});
