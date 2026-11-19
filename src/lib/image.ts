export interface LoadedImage {
  fileName: string;
  fileSizeBytes: number;
  imageData: ImageData;
  previewUrl: string;
  fileBytes: Uint8Array;
  isPng: boolean;
}

const PNG_SIGNATURE_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE_BYTES.every((signatureByte, index) => bytes[index] === signatureByte);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('The browser could not create a canvas to process the image.');
  }

  return context;
}

async function decodeFileToBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('Could not read the image. Try a valid PNG or JPEG file.');
  }
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('The selected file is not an image.');
  }

  const bitmap = await decodeFileToBitmap(file);
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const context = get2dContext(canvas);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  return {
    fileName: file.name,
    fileSizeBytes: file.size,
    imageData,
    previewUrl: URL.createObjectURL(file),
    fileBytes,
    isPng: hasPngSignature(fileBytes),
  };
}

export async function loadFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([bytes as BlobPart], { type: mimeType });
}

export function encodeImageDataToPng(imageData: ImageData): Promise<Blob> {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = get2dContext(canvas);
  context.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Creating the PNG file failed.'));
      }
    }, 'image/png');
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export async function getPngBytesForImage(image: LoadedImage): Promise<Uint8Array> {
  if (image.isPng) {
    return image.fileBytes;
  }

  const pngBlob = await encodeImageDataToPng(image.imageData);
  return new Uint8Array(await pngBlob.arrayBuffer());
}

export function bytesToBlobUrl(bytes: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
}
