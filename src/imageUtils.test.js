import { ditherImageData } from './imageUtils';

describe('ditherImageData', () => {
  test('converts image pixels to opaque black and white', () => {
    const imageData = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
      ]),
    };

    expect(ditherImageData(imageData).data).toEqual(
      new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
      ])
    );
  });

  test('treats transparent pixels as white', () => {
    const imageData = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 0]),
    };

    expect(ditherImageData(imageData).data).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
  });

  test('preserves midtone detail by distributing threshold error', () => {
    const imageData = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        127, 127, 127, 255,
        127, 127, 127, 255,
      ]),
    };

    expect(ditherImageData(imageData, 0).data).toEqual(
      new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
      ])
    );
  });

  test('lightening increases the number of white output pixels', () => {
    const makeImageData = () => ({
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(
        Array.from({ length: 8 * 8 }, () => [40, 40, 40, 255]).flat()
      ),
    });
    const countWhitePixels = (imageData) => {
      let whitePixels = 0;
      for (let pixel = 0; pixel < imageData.data.length; pixel += 4) {
        if (imageData.data[pixel] === 255) whitePixels += 1;
      }
      return whitePixels;
    };

    const darkOutput = countWhitePixels(ditherImageData(makeImageData(), 0));
    const lightOutput = countWhitePixels(ditherImageData(makeImageData(), 100));
    expect(lightOutput).toBeGreaterThan(darkOutput);
  });

  test('rejects mismatched image dimensions', () => {
    expect(() =>
      ditherImageData({ width: 1, height: 1, data: new Uint8ClampedArray(3) })
    ).toThrow('Image data dimensions do not match its pixel buffer.');
  });

  test('rejects out-of-range lightening amounts', () => {
    expect(() =>
      ditherImageData({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, 201)
    ).toThrow('Image lightening must be between 0 and 200.');
  });
});
