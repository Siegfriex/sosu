// Browser tests for src/media/* (canvas work needs a real browser). Runs against a Vite dev server so the TS modules
// can be imported directly; no API, no UI involved.  npm run test:media
import { startServer, launchBrowser, createSuite, assert } from './lib/harness.mjs';

const server = await startServer('dev');
const browser = await launchBrowser();
const page = await browser.newPage();
const { check, summary } = createSuite('media');
await page.goto(`${server.base}/`, { waitUntil: 'networkidle0' });

await page.evaluate(async () => {
  window.media = { ...(await import('/src/media/prepareProductImage.ts')), ...(await import('/src/media/prepareInsightImage.ts')), ...(await import('/src/media/compressImage.ts')) };
  // Random noise compresses badly, so a 3000² PNG comes out at several MB — a realistic "phone photo" stand-in.
  window.noisy = async (edge, name = 'photo.png') => {
    const c = new OffscreenCanvas(edge, edge); const ctx = c.getContext('2d');
    const img = ctx.createImageData(edge, edge); for (let o = 0; o < img.data.length; o += 65536) crypto.getRandomValues(img.data.subarray(o, o + 65536)); ctx.putImageData(img, 0, 0);
    return new File([await c.convertToBlob({ type: 'image/png' })], name, { type: 'image/png' });
  };
  window.dims = async (f) => { const b = await createImageBitmap(f); const d = [b.width, b.height]; b.close(); return d; };
});

await check('small image under budget is returned unchanged', async () => {
  const r = await page.evaluate(async () => { const f = await window.noisy(64, 'small.png'); const out = await window.media.prepareProductImage(f); return { same: out === f, size: f.size }; });
  assert(r.same, 'file was re-encoded'); return `${r.size} B`;
});
await check('product image: multi-MB PNG → JPEG ≤ 1.25 MB, max edge ≤ 2048', async () => {
  const r = await page.evaluate(async () => { const f = await window.noisy(3000); const out = await window.media.prepareProductImage(f); return { inSize: f.size, outSize: out.size, type: out.type, name: out.name, dims: await window.dims(out), limit: window.media.PRODUCT_IMAGE_MAX_BYTES }; });
  assert(r.inSize > r.limit, `input not over budget (${r.inSize})`);
  assert(r.outSize <= r.limit, `output ${r.outSize} > ${r.limit}`);
  assert(r.type === 'image/jpeg' && r.name.endsWith('.jpg'), `type ${r.type} name ${r.name}`);
  assert(Math.max(...r.dims) <= 2048, `dims ${r.dims}`);
  return `${(r.inSize / 1048576).toFixed(1)} MB → ${(r.outSize / 1024).toFixed(0)} KB, ${r.dims.join('×')}`;
});
await check('insight images: 3 × multi-MB → each ≤ 900 KB, combined ≤ 2.7 MB', async () => {
  const r = await page.evaluate(async () => { const fs = await Promise.all([2400, 2800, 3200].map((e, i) => window.noisy(e, `insight-${i + 1}.png`))); const out = await window.media.prepareInsightImages(fs); return { sizes: out.map((f) => f.size), total: out.reduce((n, f) => n + f.size, 0), each: window.media.INSIGHT_IMAGE_MAX_BYTES, all: window.media.INSIGHT_IMAGES_MAX_TOTAL_BYTES }; });
  assert(r.sizes.every((s) => s <= r.each), `sizes ${r.sizes}`); assert(r.total <= r.all, `total ${r.total}`);
  return `${r.sizes.map((s) => (s / 1024).toFixed(0)).join(' / ')} KB, total ${(r.total / 1024).toFixed(0)} KB`;
});
await check('insight images: wrong count rejected (MediaPrepareError.unsupported)', async () => {
  const r = await page.evaluate(async () => { try { await window.media.prepareInsightImages([await window.noisy(64)]); return null; } catch (e) { return { name: e.name, reason: e.reason }; } });
  assert(r?.name === 'MediaPrepareError' && r.reason === 'unsupported', JSON.stringify(r));
});
await check('non-image input rejected (MediaPrepareError.unsupported)', async () => {
  const r = await page.evaluate(async () => { try { await window.media.prepareProductImage(new File([new Uint8Array(2_000_000)], 'doc.pdf', { type: 'application/pdf' })); return null; } catch (e) { return { name: e.name, reason: e.reason }; } });
  assert(r?.name === 'MediaPrepareError' && r.reason === 'unsupported', JSON.stringify(r));
});
await check('undecodable image rejected (MediaPrepareError.decode)', async () => {
  const r = await page.evaluate(async () => { try { await window.media.prepareProductImage(new File([new Uint8Array(2_000_000)], 'broken.jpg', { type: 'image/jpeg' })); return null; } catch (e) { return { name: e.name, reason: e.reason }; } });
  assert(r?.name === 'MediaPrepareError' && r.reason === 'decode', JSON.stringify(r));
});

await browser.close();
server.stop();
process.exit(summary() ? 0 : 1);
