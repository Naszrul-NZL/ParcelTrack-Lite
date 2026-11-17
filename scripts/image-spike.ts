import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { sanitizeImage, validateProofFilename } from '../src/server/modules/delivery/images';
import { AppError } from '../src/server/core/errors';
import { fileFixtures } from '../tests/fixtures/files/generate';

const width = 4000;
const height = 3000;
const create = { width, height, channels: 3 as const, background: '#152e48' };
const jpeg = await sharp({ create })
  .withMetadata({ exif: { IFD0: { Artist: 'synthetic fixture' } } })
  .jpeg()
  .toBuffer();
const png = await sharp({ create }).png().toBuffer();
const inputs = [jpeg, png];

const baselineRssBytes = process.memoryUsage.rss();
let sampledPeakRssBytes = baselineRssBytes;
const sampleRss = () => {
  sampledPeakRssBytes = Math.max(sampledPeakRssBytes, process.memoryUsage.rss());
};
const start = performance.now();
const sampler = setInterval(sampleRss, 10);

const images = await Promise.all(inputs.map(async (input) => {
  const imageStart = performance.now();
  const result = await sanitizeImage(input);
  sampleRss();
  return {
    mediaType: result.mediaType,
    inputBytes: input.length,
    outputBytes: result.bytes.length,
    elapsedMs: Math.round(performance.now() - imageStart),
  };
})).finally(() => clearInterval(sampler));

const elapsedMs = Math.round(performance.now() - start);
const processPeakRssBytes = process.resourceUsage().maxRSS * 1024;
const fixtures = [];
for (const fixture of await fileFixtures()) {
  let result = 'clean';
  try {
    validateProofFilename(fixture.filename);
    const clean = await sanitizeImage(fixture.bytes);
    const metadata = await sharp(clean.bytes).metadata();
    if (metadata.exif || clean.bytes.includes(Buffer.from('synthetic-canary'))) {
      throw new Error(`Sanitization retained metadata or trailing bytes for ${fixture.id}.`);
    }
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    result = error.code;
  }
  if (result !== fixture.expected) throw new Error(`Fixture ${fixture.id} expected ${fixture.expected} but got ${result}.`);
  fixtures.push({ id: fixture.id, result });
}

const report = {
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  sharp: sharp.versions.sharp,
  libvips: sharp.versions.vips,
  width,
  height,
  images,
  elapsedMs,
  baselineRssBytes,
  sampledPeakRssBytes,
  processPeakRssBytes,
  libvipsThreads: sharp.concurrency(),
  cacheMemoryMiB: sharp.cache().memory.max,
  fixtures,
};

mkdirSync('.local/evidence', { recursive: true, mode: 0o700 });
writeFileSync('.local/evidence/image-spike.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report));
