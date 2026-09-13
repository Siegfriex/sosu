// Diagnosis: optional product image (0..1). Outbound target ≤ 1.25 MB.
import { compressImage } from './compressImage';

export const PRODUCT_IMAGE_MAX_BYTES = 1.25 * 1024 * 1024;

export const prepareProductImage = (file: File): Promise<File> => compressImage(file, { maxBytes: PRODUCT_IMAGE_MAX_BYTES });
