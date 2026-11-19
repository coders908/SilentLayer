
import type { LuminancePlane } from './spectral-kernel';

export { getCarrierGeometry, type CarrierGeometry } from './spectral-kernel';

export function toLuminancePlane(imageData: ImageData): LuminancePlane {
  const values = new Float32Array(imageData.width * imageData.height);

  for (let pixel = 0; pixel < values.length; pixel++) {
    const dataIndex = pixel * 4;
    values[pixel] =
      0.299 * imageData.data[dataIndex] +
      0.587 * imageData.data[dataIndex + 1] +
      0.114 * imageData.data[dataIndex + 2];
  }

  return { width: imageData.width, height: imageData.height, values };
}

export function applyLuminanceDelta(
  imageData: ImageData,
  original: LuminancePlane,
  modified: LuminancePlane,
): ImageData {
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );

  for (let pixel = 0; pixel < modified.values.length; pixel++) {
    const delta = modified.values[pixel] - original.values[pixel];

    if (delta === 0) {
      continue;
    }

    const dataIndex = pixel * 4;
    output.data[dataIndex] = output.data[dataIndex] + delta;
    output.data[dataIndex + 1] = output.data[dataIndex + 1] + delta;
    output.data[dataIndex + 2] = output.data[dataIndex + 2] + delta;
  }

  return output;
}
