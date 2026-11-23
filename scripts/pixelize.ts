// Pixelize an image: downscale (nearest) by a factor, optionally upscale back.
// Usage: npm run pixelize -- <in.png> <out.png> [factor=4] [--keep-small]
import sharp from 'sharp';

async function main(): Promise<void> {
  const [input, output, factorArg, flag] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: pixelize <in.png> <out.png> [factor=4] [--keep-small]');
    process.exit(1);
  }
  const factor = Math.max(1, Number(factorArg ?? 4));
  const meta = await sharp(input).metadata();
  const w = Math.max(1, Math.round((meta.width ?? 1) / factor));
  const h = Math.max(1, Math.round((meta.height ?? 1) / factor));
  const small = await sharp(input).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  const out = flag === '--keep-small' ? sharp(small) : sharp(small).resize(w * factor, h * factor, { kernel: 'nearest' });
  await out.png().toFile(output);
  console.log(`pixelized ${input} -> ${output} (${w}x${h} logical)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
