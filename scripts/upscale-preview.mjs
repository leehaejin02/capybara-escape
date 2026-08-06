/**
 * upscale-preview.mjs — scripts/out/*.png를 정수배 최근접 확대해 육안 판정하기 쉽게 만든다.
 * 판정 전용 임시 도구. 커밋 대상 아님 (scripts/out/은 .gitignore).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './lib/png.mjs';
import { encodePng } from './lib/png.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
const SCALE = 6;

const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.png') && !f.includes('_x6'));
for (const f of files) {
  const img = decodePng(readFileSync(join(OUT_DIR, f)));
  const w = img.width * SCALE;
  const h = img.height * SCALE;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / SCALE);
      const sy = Math.floor(y / SCALE);
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  const outName = f.replace(/\.png$/, '_x6.png');
  writeFileSync(join(OUT_DIR, outName), encodePng(w, h, out));
  console.log(`wrote scripts/out/${outName}`);
}
