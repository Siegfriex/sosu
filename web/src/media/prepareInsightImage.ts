// Prescription: exactly 3 insight captures. Outbound targets: each ≤ 900 KB, combined ≤ 2.7 MB.
import { compressImage, MediaPrepareError } from './compressImage';

export const INSIGHT_IMAGE_COUNT = 3;
export const INSIGHT_IMAGE_MAX_BYTES = 900 * 1024;
export const INSIGHT_IMAGES_MAX_TOTAL_BYTES = 2.7 * 1024 * 1024;

export const prepareInsightImage = (file: File): Promise<File> => compressImage(file, { maxBytes: INSIGHT_IMAGE_MAX_BYTES });

export async function prepareInsightImages(files: File[]): Promise<[File, File, File]> {
  if (files.length !== INSIGHT_IMAGE_COUNT) throw new MediaPrepareError('unsupported', `인사이트 캡처는 ${INSIGHT_IMAGE_COUNT}장이어야 해요 (${files.length}장)`);
  const prepared = await Promise.all(files.map(prepareInsightImage));
  const total = prepared.reduce((n, f) => n + f.size, 0);
  if (total > INSIGHT_IMAGES_MAX_TOTAL_BYTES) throw new MediaPrepareError('budget', `인사이트 캡처 합계가 ${Math.round(INSIGHT_IMAGES_MAX_TOTAL_BYTES / 1024)}KB를 넘어요`);
  return prepared as [File, File, File];
}
