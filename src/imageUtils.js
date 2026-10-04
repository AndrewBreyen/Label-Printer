/** Lightens then dithers image data for the thermal print head. */
export function ditherImageData(imageData, lightenAmount = 80) {
  const { width, height, data } = imageData;
  if (data.length !== width * height * 4) {
    throw new Error('Image data dimensions do not match its pixel buffer.');
  }
  if (!Number.isFinite(lightenAmount) || lightenAmount < 0 || lightenAmount > 200) {
    throw new Error('Image lightening must be between 0 and 200.');
  }

  const grayscale = new Float32Array(width * height);
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] / 255;
    const red = data[offset] * alpha + 255 * (1 - alpha);
    const green = data[offset + 1] * alpha + 255 * (1 - alpha);
    const blue = data[offset + 2] * alpha + 255 * (1 - alpha);
    grayscale[pixel] = Math.min(255, 0.299 * red + 0.587 * green + 0.114 * blue + lightenAmount);
  }

  const addError = (x, y, error, factor) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grayscale[y * width + x] += error * factor;
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const oldValue = grayscale[pixel];
      const newValue = oldValue < 128 ? 0 : 255;
      const error = oldValue - newValue;
      grayscale[pixel] = newValue;

      addError(x + 1, y, error, 7 / 16);
      addError(x - 1, y + 1, error, 3 / 16);
      addError(x, y + 1, error, 5 / 16);
      addError(x + 1, y + 1, error, 1 / 16);

      const offset = pixel * 4;
      data[offset] = newValue;
      data[offset + 1] = newValue;
      data[offset + 2] = newValue;
      data[offset + 3] = 255;
    }
  }

  return imageData;
}
