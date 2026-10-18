// Diagnosis: optional product images (0..3). Outbound target ≤ 1.25 MB each — the server limit is 1_250_000 bytes
// (decimal, app/images/types.py), so 3 photos stay under the 4 MB request body cap.
import { compressImage } from './compressImage';

export const PRODUCT_IMAGE_MAX_BYTES = 1_250_000;
export const PRODUCT_IMAGE_MAX_COUNT = 3;

export const prepareProductImage = (file: File): Promise<File> => compressImage(file, { maxBytes: PRODUCT_IMAGE_MAX_BYTES });
