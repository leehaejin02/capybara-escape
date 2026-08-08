/**
 * fix-logo-alpha.mjs — public/assets/logo_title.png의 체커보드 배경을 알파 0으로 지운다.
 *
 * 배경: 이 PNG는 사용자가 Google Gemini로 생성한 이 프로젝트 유일의 비-코드 에셋이다
 * (docs/ASSET_CREDITS.md). 원본이 "투명"이 아니라 이미지 편집기의 투명 표시 격자(체커보드)가
 * **실제 불투명 픽셀로 구워진 채** 저장돼 있었다 — 타이틀 화면에 회색 격자 사각형이 그대로 보이는 원인.
 *
 * 방법 — "바깥에서 flood fill" (좌표 나열이나 사각형 crop이 아니다):
 *   1. 캔버스 네 변의 모든 픽셀을 시작점으로 BFS(4-이웃)를 돌린다.
 *   2. 이웃 픽셀이 "체커보드 색"이면(무채색 — R≈G≈B, §COLOR_SPREAD_TOL 이내) 계속 번진다.
 *   3. 로고 실제 그림(카피바라·방패·글자)의 유채색 픽셀이나 `ink` 외곽선(무채색이 아님)에 닿으면
 *      그 자리에서 멈춘다 — 격자와 안 닿은 내부 무채색 디테일(예: 검의 회색 날)은 침식되지 않는다.
 *      번짐이 도달한 픽셀만 알파를 0으로 덮어쓴다.
 *
 * 왜 "정확히 2색 일치"가 아니라 "무채색 + 톤" 판정인가:
 *   실측 결과 체커보드가 완전한 2색 단색이 아니라 ±3~5 노이즈가 섞인 두 톤(명/암)이었다
 *   (아마 원본을 리사이즈하며 생긴 안티앨리어싱). 정확히 2색만 지우면 대부분 안 지워진다.
 *   그래서 "무채색(R≈G≈B, spread ≤ COLOR_SPREAD_TOL)"으로 넓게 잡되, **flood fill 연결성**으로
 *   안전판을 건다 — 로고 그림은 격자와 색이 비슷해도 격자에 4-이웃으로 안 닿아 있으면 안전하다.
 *
 * 검증 (이 스크립트 실행 후 수동으로 확인한 것, scripts/out/은 git 추적 대상 아님이라 재현 절차만 남긴다):
 *   - diff mask(제거된 픽셀만 빨강으로 표시)를 렌더해 육안 확인 — 카피바라·방패·글자·구름·별·채소
 *     전부 빨강 없이 그대로 남았고, 빨강은 체커보드 영역 + 우하단의 생성기 워터마크(작은 회색
 *     반짝임 아이콘, 로고 본체와 무관)에만 정확히 일치했다.
 *   - 창끝·꼬리 말림·별 뾰족한 끝처럼 얇은 디테일을 4배 확대해 개별 검사 — 침식 없음.
 *   - sky_soft(#8FC7E0)·ink(#16121C) 배경 위에 합성해 가장자리에 회색 헤일로가 남지 않는지 확인.
 *
 * 실행: `node scripts/fix-logo-alpha.mjs`
 * 원본은 덮어쓰지 않는다 — art-source/logo_title_raw.png에 먼저 백업하고,
 * public/assets/logo_title.png(게임이 실제로 로드하는 파일)에는 알파만 고친 결과를 쓴다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, encodePng } from './lib/png.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ASSETS_DIR = join(REPO_ROOT, 'public', 'assets');
const SRC_PATH = join(ASSETS_DIR, 'logo_title.png');
const BACKUP_DIR = join(ASSETS_DIR, 'source');
const BACKUP_PATH = join(BACKUP_DIR, 'logo_title_raw.png');

/** 그레이스케일 판정 문턱값. max(R,G,B) - min(R,G,B)가 이 값 이하면 "무채색"으로 본다.
 * 실측 체커보드 노이즈(±3~5)를 덮으면서, 로고의 유채색(갈색·초록·주황 등)은 걸러내는 값. */
const COLOR_SPREAD_TOL = 8;

function isBackgroundish(data, width, x, y) {
  const i = (y * width + x) * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a !== 255) return false; // 이미 투명한 픽셀은 새로 번질 시작점이 아니다(이미 처리됨과 무관)
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread <= COLOR_SPREAD_TOL;
}

function floodFillBackground(width, height, data) {
  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) {
    stack.push(x, 0, x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    stack.push(0, y, width - 1, y);
  }

  let filled = 0;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    if (!isBackgroundish(data, width, x, y)) continue;
    visited[vi] = 1;
    filled++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return { visited, filled };
}

function main() {
  if (!existsSync(SRC_PATH)) {
    throw new Error(`fix-logo-alpha: 원본을 찾을 수 없다 — ${SRC_PATH}`);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  if (!existsSync(BACKUP_PATH)) {
    copyFileSync(SRC_PATH, BACKUP_PATH);
    console.log(`백업 저장: ${BACKUP_PATH}`);
  } else {
    console.log(`백업 이미 존재(건너뜀): ${BACKUP_PATH}`);
  }

  const buf = readFileSync(SRC_PATH);
  const { width, height, data } = decodePng(buf);

  const { visited, filled } = floodFillBackground(width, height, data);

  const out = Uint8Array.from(data);
  for (let p = 0; p < width * height; p++) {
    if (visited[p]) out[p * 4 + 3] = 0;
  }

  writeFileSync(SRC_PATH, encodePng(width, height, out));
  console.log(
    `logo_title.png 알파 수정 완료 — ${width}×${height}, 투명 처리 ${filled}px / 전체 ${width * height}px (${((filled / (width * height)) * 100).toFixed(1)}%)`
  );
}

main();
