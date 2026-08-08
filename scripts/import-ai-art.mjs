/**
 * import-ai-art.mjs — AI(Google Gemini)가 생성한 고해상 래스터 시트를
 * 이 게임의 32×32 픽셀 규격으로 변환해 `public/assets/`에 굽는다.
 *
 * 왜 이 스크립트가 필요한가
 * ------------------------------------------------------------------
 * 생성 AI의 출력은 "픽셀아트처럼 보이는 래스터 그림"이지 픽셀아트가 아니다.
 * 실측(2026-08-08): 카피바라 시트는 2560×2560에 **고유색 51,953개**였다.
 * 진짜 32×32 픽셀아트라면 수십 개여야 한다. 그대로 축소하면 안티에일리어싱
 * 얼룩이 픽셀 단위 잡음으로 굳는다 — 지금 게임 바닥이 잡음으로 보이는 것과
 * 같은 실패다. 그래서 단순 축소가 아니라 아래 5단계를 거친다.
 *
 *   1) 블록 최빈색 추출  — 평균이 아니라 최빈값. 평균은 외곽선을 흐린다.
 *   2) 칸 구분선 제거    — AI가 칸마다 검은 테두리를 그려 넣는다. 그대로 두면
 *                          벽이 세로로 이어질 때 마디처럼 끊겨 보인다.
 *   3) 색 뭉치기         — 타일당 상위 K색으로 흡수.
 *   4) 고립 픽셀 제거    — 8이웃 중 같은 색이 1개 이하면 이웃 최빈색으로.
 *                          3픽셀보다 작은 디테일은 32×32에서 전부 잡음이 된다.
 *   5) 행 밝기 평준화    — 바닥 변형 4종의 평균 밝기를 맞춘다. 안 맞추면
 *                          variant 선택 격자((col*7+row*13)%4)가 체커보드로 드러난다.
 *
 * 출처·라이선스는 `docs/ASSET_CREDITS.md`, 스코프 결정은 `docs/DECISIONS.md` D14.
 * 원본은 저장소 루트의 `art-source/`에 보존한다 — 되돌릴 수 있어야 한다(D14-e).
 * **`public/` 밖에 두는 이유**: Vite는 `public/` 아래를 통째로 `dist/`에 복사한다.
 * 원본을 거기 두면 34MB짜리 2560×2560 래스터가 매 배포마다 서버에 올라간다
 * (실측 2026-08-08: `dist/assets` 36MB). 게임은 이 파일들을 한 번도 요청하지 않는다.
 *
 * 사용: npm run import:art
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'art-source');
const OUT_DIR = join(ROOT, 'public/assets');
const TILE = 32;

// ── PNG 디코드 (colorType 2=RGB / 6=RGBA 둘 다 받는다) ──────────────
// lib/png.mjs의 decodePng는 RGBA만 받는데, 생성 AI는 알파 없는 RGB로 내보낼 때가
// 많다(카피바라 시트가 그랬다). 여기서만 쓰는 확장판이라 lib을 건드리지 않는다.
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodeRgbOrRgba(buf) {
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = d.readUInt32BE(0); height = d.readUInt32BE(4);
      bitDepth = d[8]; colorType = d[9]; interlace = d[12];
    } else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`지원하지 않는 PNG 형식 (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rs = y * (stride + 1), ft = raw[rs];
    const row = raw.subarray(rs + 1, rs + 1 + stride), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      cur[i] = ft === 0 ? row[i] : ft === 1 ? (row[i] + a) & 255 : ft === 2 ? (row[i] + b) & 255
             : ft === 3 ? (row[i] + ((a + b) >> 1)) & 255 : (row[i] + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, o = (y * width + x) * 4;
      out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2];
      out[o + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

/** 마젠타(#FF00FF) 배경. 초록·갈색·빨강은 살아남는 여유 폭을 둔다. */
const isMagenta = (r, g, b) => r > 150 && b > 150 && g < 110 && r - g > 60 && b - g > 60;
const rgbKey = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 1단계 — 블록 최빈색으로 축소. 칸이 정사각형이 아닐 수 있어 가로/세로 배율을 따로 잡는다. */
function downsample(img, cols, rows, keyMagenta) {
  const OW = cols * TILE, OH = rows * TILE;
  const nx = img.width / OW, ny = img.height / OH;
  const insetX = Math.max(1, Math.floor(nx * 0.15));
  const insetY = Math.max(1, Math.floor(ny * 0.15));
  const out = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const votes = new Map();
      for (let sy = Math.floor(y * ny) + insetY; sy < Math.floor((y + 1) * ny) - insetY; sy++) {
        for (let sx = Math.floor(x * nx) + insetX; sx < Math.floor((x + 1) * nx) - insetX; sx++) {
          if (sy >= img.height || sx >= img.width) continue;
          const i = (sy * img.width + sx) * 4;
          if (img.data[i + 3] === 0) continue;
          // 5비트로 양자화해 AA 노이즈를 뭉쳐 센다
          const k = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
          votes.set(k, (votes.get(k) || 0) + 1);
        }
      }
      let best = 0, bn = -1;
      for (const [k, n] of votes) if (n > bn) { bn = n; best = k; }
      const r = ((best >> 10) & 31) << 3, g = ((best >> 5) & 31) << 3, b = (best & 31) << 3;
      const o = (y * OW + x) * 4;
      if (bn < 0 || (keyMagenta && isMagenta(r, g, b))) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; }
      else { out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255; }
    }
  }
  return { width: OW, height: OH, data: out };
}

/** 2단계 — 칸 테두리로 그려진 어두운 줄을 안쪽 줄로 덮는다. */
function stripBorder(img, ox, oy) {
  const { width: W, data } = img;
  const L = (x, y) => { const i = ((oy + y) * W + ox + x) * 4; return lumOf(data[i], data[i + 1], data[i + 2]); };
  const cp = (fx, fy, tx, ty) => {
    const s = ((oy + fy) * W + ox + fx) * 4, d = ((oy + ty) * W + ox + tx) * 4;
    data[d] = data[s]; data[d + 1] = data[s + 1]; data[d + 2] = data[s + 2]; data[d + 3] = data[s + 3];
  };
  const mean = (f) => { let s = 0; for (let k = 0; k < TILE; k++) s += f(k); return s / TILE; };
  if (mean(k => L(k, 0)) < mean(k => L(k, 2)) - 18) for (let k = 0; k < TILE; k++) cp(k, 1, k, 0);
  if (mean(k => L(k, TILE - 1)) < mean(k => L(k, TILE - 3)) - 18) for (let k = 0; k < TILE; k++) cp(k, TILE - 2, k, TILE - 1);
  if (mean(k => L(0, k)) < mean(k => L(2, k)) - 18) for (let k = 0; k < TILE; k++) cp(1, k, 0, k);
  if (mean(k => L(TILE - 1, k)) < mean(k => L(TILE - 3, k)) - 18) for (let k = 0; k < TILE; k++) cp(TILE - 2, k, TILE - 1, k);
}

/** 3단계 — 타일당 상위 K색으로 흡수. */
function quantizeTile(img, ox, oy, K) {
  const { width: W, data } = img;
  const freq = new Map();
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = ((oy + y) * W + ox + x) * 4;
    if (data[i + 3] === 0) continue;
    const k = rgbKey(data, i);
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, K).map(e => e[0]);
  if (top.length === 0) return;
  const d2 = (c, t) => {
    const dr = ((c >> 16) & 255) - ((t >> 16) & 255);
    const dg = ((c >> 8) & 255) - ((t >> 8) & 255);
    const db = (c & 255) - (t & 255);
    return dr * dr + dg * dg + db * db;
  };
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = ((oy + y) * W + ox + x) * 4;
    if (data[i + 3] === 0) continue;
    const c = rgbKey(data, i);
    let best = top[0], bd = Infinity;
    for (const t of top) { const d = d2(c, t); if (d < bd) { bd = d; best = t; } }
    data[i] = (best >> 16) & 255; data[i + 1] = (best >> 8) & 255; data[i + 2] = best & 255;
  }
}

/** 4단계 — 고립 픽셀 제거. wrap=true면 타일 경계를 순환 참조(이어붙는 바닥용). */
function despeckle(img, ox, oy, wrap) {
  const { width: W, data } = img;
  const snap = data.slice();
  const at = (x, y) => {
    const xx = wrap ? (x + TILE) % TILE : Math.max(0, Math.min(TILE - 1, x));
    const yy = wrap ? (y + TILE) % TILE : Math.max(0, Math.min(TILE - 1, y));
    return ((oy + yy) * W + ox + xx) * 4;
  };
  const N8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = at(x, y);
    if (snap[i + 3] === 0) continue;
    const me = rgbKey(snap, i);
    const votes = new Map();
    let same = 0;
    for (const [dx, dy] of N8) {
      const j = at(x + dx, y + dy);
      if (snap[j + 3] === 0) continue;
      const k = rgbKey(snap, j);
      if (k === me) same++;
      votes.set(k, (votes.get(k) || 0) + 1);
    }
    if (same <= 1) {
      let best = me, bn = -1;
      for (const [k, n] of votes) if (n > bn) { bn = n; best = k; }
      data[i] = (best >> 16) & 255; data[i + 1] = (best >> 8) & 255; data[i + 2] = best & 255;
    }
  }
}

/** 5단계 — 한 행(구역) 변형 4종의 평균 밝기를 맞춘다. */
function levelRow(img, row, cols) {
  const { width: W, data } = img;
  const means = [];
  for (let c = 0; c < cols; c++) {
    let s = 0, n = 0;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = ((row * TILE + y) * W + c * TILE + x) * 4;
      s += lumOf(data[i], data[i + 1], data[i + 2]); n++;
    }
    means.push(s / n);
  }
  const target = means.reduce((a, b) => a + b, 0) / cols;
  for (let c = 0; c < cols; c++) {
    const d = target - means[c];
    if (Math.abs(d) < 1) continue;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = ((row * TILE + y) * W + c * TILE + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, data[i + k] + d));
    }
  }
  const spread = Math.round(Math.max(...means) - Math.min(...means));
  return spread;
}

/** 캐릭터 시트: 칸마다 발끝 높이를 맞춘다. 안 맞추면 방향 전환 때 캐릭터가 위아래로 튄다. */
function alignFeet(img, cols, rows) {
  const { width: W, data } = img;
  const bottoms = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let b = -1;
    for (let y = TILE - 1; y >= 0; y--) {
      for (let x = 0; x < TILE; x++) if (data[((r * TILE + y) * W + c * TILE + x) * 4 + 3] > 8) { b = y; break; }
      if (b >= 0) break;
    }
    bottoms.push({ r, c, b });
  }
  const target = Math.max(...bottoms.map(o => o.b));
  let moved = 0;
  for (const { r, c, b } of bottoms) {
    const dy = target - b;
    if (dy <= 0) continue;
    moved++;
    for (let y = TILE - 1; y >= 0; y--) {
      for (let x = 0; x < TILE; x++) {
        const dst = ((r * TILE + y) * W + c * TILE + x) * 4;
        const sy = y - dy;
        if (sy < 0) { data[dst] = data[dst + 1] = data[dst + 2] = data[dst + 3] = 0; continue; }
        const src = ((r * TILE + sy) * W + c * TILE + x) * 4;
        data[dst] = data[src]; data[dst + 1] = data[src + 1];
        data[dst + 2] = data[src + 2]; data[dst + 3] = data[src + 3];
      }
    }
  }
  return { target, moved, spread: target - Math.min(...bottoms.map(o => o.b)) };
}

/** 한 행을 다른 행으로 복사하며 색을 변조한다 (숲 벽 대체용). */
function copyRowShifted(img, fromRow, toRow, cols, mul, add) {
  const { width: W, data } = img;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < cols * TILE; x++) {
    const s = ((fromRow * TILE + y) * W + x) * 4, d = ((toRow * TILE + y) * W + x) * 4;
    for (let k = 0; k < 3; k++) data[d + k] = Math.max(0, Math.min(255, Math.round(data[s + k] * mul[k] + add[k])));
    data[d + 3] = data[s + 3];
  }
}

/** 칸(ox,oy)의 불투명 바운딩 박스. 비어 있으면 null. */
function bboxOf(img, ox, oy) {
  const { width: W, data } = img;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (data[((oy + y) * W + ox + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, cx: (x0 + x1) / 2 };
}

/**
 * 아이템 시트(행=종류, 열=방향)를 게임 규격(종류별 파일, 행=방향, 열=프레임)으로 재배치한다.
 * 동시에 몸통 기준으로 위치를 맞춘다 — AI는 아이템을 칸 한가운데에 그려서 그대로 쓰면 머리에서 뜬다.
 *
 * anchor='head'  : 아이템 아래끝을 몸통 머리끝 + sink 로 맞춘다 (모자)
 * anchor='body'  : 아이템 아래끝을 몸통 발끝 - lift 로 맞춘다 (의상)
 * 가로는 항상 몸통 중심에 맞춘다.
 *
 * 프레임 4칸에 같은 그림을 복제한다 — 카피바라 4프레임이 머리·몸통 위치가 동일하기
 * 때문에 성립한다(2026-08-08 실측: 행 안에서 바운딩 박스 편차 0~1px).
 */
function layoutItemSheet(itemSheet, itemRow, body, anchor, offset, neckFrac = 0.5) {
  const out = new Uint8ClampedArray(4 * TILE * 4 * TILE * 4);
  const OW = 4 * TILE;
  for (let dir = 0; dir < 4; dir++) {
    const src = bboxOf(itemSheet, dir * TILE, itemRow * TILE);
    const bb = bboxOf(body, 0, dir * TILE); // 몸통 프레임 0 기준
    if (!src || !bb) continue;
    const targetBottom = anchor === 'head' ? bb.y0 + offset : bb.y1 - offset;
    const dy = Math.round(targetBottom - src.y1);
    const dx = Math.round(bb.cx - src.cx);
    /*
     * 의상은 목선 위를 잘라낸다.
     *
     * AI가 옷을 **몸통 전체를 덮는 덩어리**로 그렸다(실측 2026-08-08: 멜빵바지 높이 20,
     * 시작 y=9 — 몸통 높이 21, 시작 y=9와 사실상 같다). 밑단만 맞추면 얼굴이 통째로 덮인다.
     * 옷 아래쪽에 AI가 넣어 준 크림색 띠가 몸통의 배 띠와 맞아야 하므로 밑단 정렬은 유지하고,
     * 목선 위쪽만 잘라 얼굴을 되살린다. 목선은 짐작하지 않고 `measureNeckFrac()`이
     * **얼굴을 실제로 찾아서** 정한다 — 처음엔 "위에서 34%"로 잡았는데 그게 하필 눈 위치였다
     * (실측: 몸통 y9~29에서 눈·코가 y16~19, 34%는 정확히 y16).
     * 모자(anchor='head')는 머리 위에 얹히는 것이므로 자르지 않는다.
     */
    const neckY = anchor === 'body' ? bb.y0 + Math.round((bb.y1 - bb.y0 + 1) * neckFrac) : -1;
    for (let f = 0; f < 4; f++) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        if (neckY >= 0 && y < neckY) continue;
        const sx = x - dx, sy = y - dy;
        if (sx < 0 || sx >= TILE || sy < 0 || sy >= TILE) continue;
        const si = ((itemRow * TILE + sy) * itemSheet.width + dir * TILE + sx) * 4;
        if (itemSheet.data[si + 3] === 0) continue;
        const di = ((dir * TILE + y) * OW + f * TILE + x) * 4;
        out[di] = itemSheet.data[si]; out[di + 1] = itemSheet.data[si + 1];
        out[di + 2] = itemSheet.data[si + 2]; out[di + 3] = 255;
      }
    }
  }
  return { width: OW, height: 4 * TILE, data: out };
}


/**
 * 몸통 정면에서 **얼굴이 끝나는 높이**를 찾아 비율로 돌려준다.
 * 눈·코는 주변보다 확연히 어두운 점 뭉치라, 몸통 위쪽 60% 안에서
 * 「어두운 픽셀이 2개 이상인 마지막 행」을 얼굴 아래끝으로 본다.
 * 실측(2026-08-08): 몸통 y9~29에서 y16(2) y17(3) y18(5) y19(1) → 얼굴 아래끝 18 → 목선 20.
 */
function measureNeckFrac(body) {
  const { width: W, data } = body;
  const bb = bboxOf(body, 0, 0);
  if (!bb) return 0.5;
  const h = bb.y1 - bb.y0 + 1;
  const limit = bb.y0 + Math.round(h * 0.6);
  let faceBottom = -1;
  for (let y = bb.y0; y <= limit; y++) {
    let dark = 0;
    for (let x = 0; x < TILE; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] <= 8) continue;
      if (lumOf(data[i], data[i + 1], data[i + 2]) < 70) dark++;
    }
    if (dark >= 2) faceBottom = y;
  }
  if (faceBottom < 0) return 0.5;
  const neckY = faceBottom + 2;          // 얼굴 아래 2px 여유
  return Math.min(0.72, (neckY - bb.y0) / h);
}

/** 몸 색 변형. 명도·채도만 건드린다 — 형태와 외곽선은 그대로 둔다. */
function recolorBody(sheet, mode) {
  const out = new Uint8ClampedArray(sheet.data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    let [r, g, b] = [out[i], out[i + 1], out[i + 2]];
    const l = lumOf(r, g, b);
    if (l < 60) continue; // 외곽선은 건드리지 않는다
    if (mode === 'light') { r = r * 0.9 + 60; g = g * 0.9 + 52; b = b * 0.9 + 40; }
    else if (mode === 'grey') { const m = l; r = m * 0.95 + 8; g = m * 0.95 + 6; b = m * 0.95 + 10; }
    else if (mode === 'white') { const m = l; r = m * 0.55 + 112; g = m * 0.55 + 108; b = m * 0.55 + 100; }
    out[i] = Math.min(255, r); out[i + 1] = Math.min(255, g); out[i + 2] = Math.min(255, b);
  }
  return { width: sheet.width, height: sheet.height, data: out };
}

// ── 실행 ────────────────────────────────────────────────────────────
const jobs = [
  { file: 'ai_floor_src.png',  out: 'tile_floor.png',  cols: 4, rows: 3, magenta: false, K: 4, wrap: true,  level: true },
  { file: 'ai_wall_src.png',   out: 'tile_wall.png',   cols: 4, rows: 3, magenta: false, K: 6, wrap: false, level: false, forestFromVillage: true },
  // 게임이 실제로 그리는 고블린 텍스처는 `goblin_walk`다(GameScene.ts). 규약은
  // anims.ts의 ensureWalkAnims — 4×4, 행 = 방향(0=down 1=up 2=left 3=right), 열 = 프레임.
  // `goblin_idle`은 BootScene이 로드하지만 어느 씬도 쓰지 않는 죽은 에셋이다(2026-08-08 확인).
  // 지우는 건 별건이라 손대지 않고, 두 시트가 어긋나 보이지 않게 같은 내용을 함께 굽는다.
  { file: 'ai_goblin_src.png', out: 'goblin_walk.png', alsoOut: ['goblin_idle.png'], cols: 4, rows: 4, magenta: true, K: 8, wrap: false, level: false, feet: true },
  { file: 'ai_props_src.png',  out: 'props.png',      cols: 4, rows: 3, magenta: true,  K: 8, wrap: false, level: false },
];

let ran = 0;
for (const job of jobs) {
  const path = join(SRC_DIR, job.file);
  if (!existsSync(path)) { console.log(`skip  ${job.file} (없음)`); continue; }
  const img = decodeRgbOrRgba(readFileSync(path));
  const sheet = downsample(img, job.cols, job.rows, job.magenta);

  for (let r = 0; r < job.rows; r++) for (let c = 0; c < job.cols; c++) {
    stripBorder(sheet, c * TILE, r * TILE);
    quantizeTile(sheet, c * TILE, r * TILE, job.K);
    despeckle(sheet, c * TILE, r * TILE, job.wrap);
  }

  const notes = [];
  if (job.level) {
    for (let r = 0; r < job.rows; r++) notes.push(`행${r} 밝기편차 ${levelRow(sheet, r, job.cols)}→0`);
  }
  if (job.forestFromVillage) {
    // 숲 행(0)은 AI가 2·4열을 흙바닥으로 그려 벽이 이어지지 않는다(2026-08-08 실측).
    // 재생성 대신 마을 나무벽(행1)을 어둡고 탁하게 변조해 숲 벽으로 쓴다.
    // 초록은 한 픽셀도 들어가지 않는다 — D11-c C13(숲에서 초록=통과 가능) 유지.
    copyRowShifted(sheet, 1, 0, job.cols, [0.78, 0.80, 0.72], [6, 4, 2]);
    notes.push('숲 행 = 마을 나무벽 변조본 (AI 원본은 2·4열이 벽이 아니었다)');
  }
  if (job.feet) {
    const a = alignFeet(sheet, job.cols, job.rows);
    notes.push(`발끝 정렬: 편차 ${a.spread}px, ${a.moved}칸 이동`);
  }

  const png = encodePng(sheet.width, sheet.height, sheet.data);
  writeFileSync(join(OUT_DIR, job.out), png);
  for (const extra of job.alsoOut ?? []) writeFileSync(join(OUT_DIR, extra), png);
  const uniq = new Set();
  for (let i = 0; i < sheet.data.length; i += 4) if (sheet.data[i + 3]) uniq.add(rgbKey(sheet.data, i));
  console.log(`write ${job.out}  ${sheet.width}x${sheet.height}  색 ${uniq.size}개  ${notes.join(' / ')}`);
  ran++;
}

// ── 캐릭터 세트: 몸통 + 모자 + 의상 ────────────────────────────────
// 세 장이 런타임에 겹쳐지므로(CustomizeScene.bakeCompositeTexture) 반드시 함께 굽는다.
// 하나만 새것으로 바꾸면 나머지가 어긋난다 — D14-b가 카피바라를 뒤로 미룬 이유다.
const capySrc = join(SRC_DIR, 'ai_capybara_src.png');
if (existsSync(capySrc)) {
  const body = downsample(decodeRgbOrRgba(readFileSync(capySrc)), 4, 4, false);
  // 흰 배경(체크무늬 포함)을 뺀다. 카피바라 배의 크림색은 중성이 아니라 살아남는다.
  for (let i = 0; i < body.data.length; i += 4) {
    const [r, g, b] = [body.data[i], body.data[i + 1], body.data[i + 2]];
    if (Math.min(r, g, b) > 230 && Math.max(r, g, b) - Math.min(r, g, b) < 12) body.data[i + 3] = 0;
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    quantizeTile(body, c * TILE, r * TILE, 10);
    despeckle(body, c * TILE, r * TILE, false);
  }
  const fa = alignFeet(body, 4, 4);

  const COLORWAYS = [['capy_body_01', 'base'], ['capy_body_02', 'light'], ['capy_body_03', 'grey'], ['capy_body_04', 'white']];
  for (const [name, mode] of COLORWAYS) {
    const v = mode === 'base' ? body : recolorBody(body, mode);
    writeFileSync(join(OUT_DIR, `${name}.png`), encodePng(v.width, v.height, v.data));
  }
  console.log(`write capy_body_01..04  발끝 정렬: 편차 ${fa.spread}px, ${fa.moved}칸 이동`);

  // 모자: AI 시트 행 = 종류. CustomizeScene의 3칸(밀짚/마법사/헬멧)에 맞춰 0·1·3행을 쓴다.
  // 2행(나뭇잎 왕관)은 슬롯이 없어 쓰지 않는다 — 슬롯을 늘리는 건 코드 변경이라 스코프 밖.
  const hatSrc = join(SRC_DIR, 'ai_hat_src.png');
  if (existsSync(hatSrc)) {
    const hats = downsample(decodeRgbOrRgba(readFileSync(hatSrc)), 4, 4, true);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      quantizeTile(hats, c * TILE, r * TILE, 8); despeckle(hats, c * TILE, r * TILE, false);
    }
    // sink=4: 모자 아래끝을 머리 꼭대기보다 4px 아래로 — 얹힌 것처럼 보이게 하는 값.
    [[0, 'capy_hat_01'], [1, 'capy_hat_02'], [3, 'capy_hat_03']].forEach(([row, name]) => {
      const s = layoutItemSheet(hats, row, body, 'head', 4);
      writeFileSync(join(OUT_DIR, `${name}.png`), encodePng(s.width, s.height, s.data));
    });
    console.log('write capy_hat_01..03  (AI 2행 「나뭇잎 왕관」은 슬롯이 없어 미사용)');
  }

  // 의상: AI 시트 4행이 슬롯 4개와 1:1.
  const outfitSrc = join(SRC_DIR, 'ai_outfit_src.png');
  if (existsSync(outfitSrc)) {
    const outfits = downsample(decodeRgbOrRgba(readFileSync(outfitSrc)), 4, 4, true);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      quantizeTile(outfits, c * TILE, r * TILE, 8); despeckle(outfits, c * TILE, r * TILE, false);
    }
    // lift=1: 옷 아래끝을 발끝보다 1px 위로. 발이 옷에 먹히지 않게 한다.
    const neckFrac = measureNeckFrac(body);
    console.log(`  목선 비율 ${(neckFrac * 100).toFixed(0)}% (얼굴 실측 기반)`);
    for (let row = 0; row < 4; row++) {
      const s = layoutItemSheet(outfits, row, body, 'body', 1, neckFrac);
      writeFileSync(join(OUT_DIR, `capy_outfit_0${row + 1}.png`), encodePng(s.width, s.height, s.data));
    }
    console.log('write capy_outfit_01..04');
  }
  ran++;
}

if (ran === 0) {
  console.error(`\n실패: ${SRC_DIR} 에서 변환할 원본을 하나도 찾지 못했다.`);
  console.error('경로 오타이거나 원본이 아직 안 들어온 상태다. 조용히 통과시키지 않는다.');
  process.exit(1);
}
console.log(`\n${ran}개 시트 변환 완료.`);
