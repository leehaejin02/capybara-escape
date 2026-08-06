/**
 * png.mjs — 무의존 PNG-32(RGBA) 인코더/디코더.
 *
 * 새 npm 의존성을 추가하지 않기 위해 node:zlib(deflate/inflate)만 쓰고
 * PNG 청크 구조(시그니처 / IHDR / IDAT / IEND)와 CRC32, 스캔라인 필터(0~4)를
 * 직접 구현한다. bitDepth=8, colorType=6(RGBA), interlace=0만 지원한다 —
 * 이 프로젝트가 생성하는 PNG는 전부 이 형식이다.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 (PNG 표준: 다항식 0xEDB88320) ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * width×height RGBA(Uint8Array/Buffer, length = width*height*4)를 PNG-32 버퍼로 인코딩한다.
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePng: rgba length mismatch — expected ${width * height * 4}, got ${rgba.length}`
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 스캔라인마다 필터 바이트 0(None)을 붙인다. 픽셀아트는 압축률보다 구현 단순성이 우선이다.
  const stride = width * 4;
  const rgbaBuf = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    rgbaBuf.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * PNG-32(RGBA, bitDepth 8, interlace 0) 버퍼를 디코딩해 {width, height, data} 를 돌려준다.
 * data는 length = width*height*4 인 Uint8Array (RGBA, un-filtered).
 * 이 프로젝트 밖에서 만든 임의의 PNG(팔레트 컬러타입, 인터레이스 등)는 지원하지 않는다 —
 * 지원하지 않는 형식을 만나면 조용히 잘못 읽는 대신 던진다.
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('decodePng: PNG 시그니처 불일치');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `decodePng: 지원하지 않는 형식 (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}). RGBA8/non-interlaced만 지원한다.`
    );
  }

  const raw = inflateSync(Buffer.concat(idatParts));
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  let prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];
    const row = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const outRow = new Uint8Array(stride);

    for (let i = 0; i < stride; i++) {
      const bpp = 4;
      const a = i >= bpp ? outRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let value;
      switch (filterType) {
        case 0:
          value = row[i];
          break;
        case 1:
          value = (row[i] + a) & 0xff;
          break;
        case 2:
          value = (row[i] + b) & 0xff;
          break;
        case 3:
          value = (row[i] + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          value = (row[i] + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`decodePng: 알 수 없는 필터 타입 ${filterType} (row ${y})`);
      }
      outRow[i] = value;
    }

    out.set(outRow, y * stride);
    prevRow = outRow;
  }

  return { width, height, data: out };
}
