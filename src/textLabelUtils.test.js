import { generateTextCanvas } from './textLabelUtils';

describe('generateTextCanvas', () => {
  const context = {
    measureText: jest.fn((text) => ({ width: text.length * 10 })),
    fillRect: jest.fn(),
    fillText: jest.fn(),
    save: jest.fn(),
    scale: jest.fn(),
    restore: jest.fn(),
  };

  beforeEach(() => {
    context.measureText.mockImplementation((text) => ({ width: text.length * 10 }));
    jest.spyOn(document, 'createElement').mockImplementation(() => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('uses manual markdown rendering and sizes the canvas to the widest line', () => {
    const canvas = generateTextCanvas('# Hi\n## There');

    expect(canvas.width).toBe(70);
    expect(canvas.height).toBe(120);
    expect(context.fillText).toHaveBeenNthCalledWith(1, 'Hi', 35, 45.5, 50);
    expect(context.fillText).toHaveBeenNthCalledWith(2, 'There', 35, 80.5, 50);
  });

  test('increases the canvas width for wider text', () => {
    const shortCanvas = generateTextCanvas('Hi');
    const longCanvas = generateTextCanvas('Much wider');

    expect(longCanvas.width).toBeGreaterThan(shortCanvas.width);
  });

  test('rejects whitespace-only text', () => {
    expect(() => generateTextCanvas('   ')).toThrow('Enter text to print.');
  });

  test('scales multiple markdown lines to fit the tape width', () => {
    generateTextCanvas('# One\n# Two\n# Three');

    expect(context.scale).toHaveBeenCalledWith(1, 120 / 126);
  });
});
