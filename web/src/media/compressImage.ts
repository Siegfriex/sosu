// Client-side image preparation: fit an image under a byte budget by re-encoding (and downscaling if needed).
// Pure browser utility — no knowledge of the API; returns a File the transport can send as-is.

export class MediaPrepareError extends Error {
  readonly reason: 'unsupported' | 'decode' | 'budget';
  constructor(reason: 'unsupported' | 'decode' | 'budget', message: string) {
    super(message);
    this.name = 'MediaPrepareError';
    this.reason = reason;
  }
}

export interface CompressOptions {
  maxBytes: number;
  maxEdge?: number;
  minEdge?: number;
}

const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

async function decode(file: File): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new MediaPrepareError('decode', `이미지를 읽을 수 없어요: ${file.name}`); }
}

function draw(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function encode(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaPrepareError('decode', '인코딩 실패'))), 'image/jpeg', quality));
}

const jpegName = (name: string) => name.replace(/\.[^.]+$/, '') + '.jpg';

export async function compressImage(file: File, { maxBytes, maxEdge = 2048, minEdge = 320 }: CompressOptions): Promise<File> {
  if (!file.type.startsWith('image/')) throw new MediaPrepareError('unsupported', `이미지 파일만 준비할 수 있어요: ${file.name}`);
  if (file.size <= maxBytes) return file;

  const bitmap = await decode(file);
  try {
    let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    while (Math.max(bitmap.width, bitmap.height) * scale >= minEdge) {
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = draw(bitmap, w, h);
      for (const q of QUALITIES) {
        const blob = await encode(canvas, q);
        if (blob.size <= maxBytes) return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
      }
      scale *= 0.7;
    }
  } finally { bitmap.close(); }
  throw new MediaPrepareError('budget', `${file.name}을(를) ${Math.round(maxBytes / 1024)}KB 이하로 줄일 수 없어요`);
}
