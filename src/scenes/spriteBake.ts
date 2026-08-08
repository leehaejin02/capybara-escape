import Phaser from 'phaser';

/**
 * spriteBake.ts — 커스터마이즈 3레이어(body/outfit/hat)를 `RenderTexture`로 **1회 합성**해
 * 단일 스프라이트시트 텍스처로 굽는다. GDD 4장 / docs/GDD.md 10장 4단계.
 *
 * 매 프레임 3장을 겹쳐 그리지 않기 위한 장치다 — 굽고 나면 `player_composite` 텍스처 하나가
 * `capy_body_*`와 동일한 4×4(128×128) 프레임 배치(§2.1 frameIndex = dir*4+frame)를 그대로 갖는다.
 * 이 파일은 Phaser 의존이므로 `src/scenes/`에 둔다 (`src/sim/`이 아니다).
 */

const FRAME_SIZE = 32;
const SHEET_COLS = 4;
const SHEET_ROWS = 4;
const FRAME_COUNT = SHEET_COLS * SHEET_ROWS;

export interface CustomizeSelection {
  /** 0..3 → capy_body_01..04 */
  bodyIndex: number;
  /** 0..4 → capy_outfit_00..04 */
  outfitIndex: number;
  /** 0..5 → capy_hat_00..05 (04=유자, 05=오렌지는 코드 생성) */
  hatIndex: number;
}

export function bodyTextureKey(bodyIndex: number): string {
  return `capy_body_${String(bodyIndex + 1).padStart(2, '0')}`;
}

export function outfitTextureKey(outfitIndex: number): string {
  return `capy_outfit_${String(outfitIndex).padStart(2, '0')}`;
}

export function hatTextureKey(hatIndex: number): string {
  return `capy_hat_${String(hatIndex).padStart(2, '0')}`;
}

/**
 * `selection`을 `outKey` 텍스처로 굽는다. 이미 같은 키가 있으면 지우고 다시 만든다
 * (재시작 시 다른 조합으로 다시 구울 수 있어야 한다).
 * 결과 텍스처는 `capy_body_*`와 동일한 프레임 번호(0..15, dir*4+frame)를 갖는다.
 */
export function bakeCompositeTexture(scene: Phaser.Scene, selection: CustomizeSelection, outKey: string): void {
  if (scene.textures.exists(outKey)) {
    scene.textures.remove(outKey);
  }

  const bodyKey = bodyTextureKey(selection.bodyIndex);
  const outfitKey = outfitTextureKey(selection.outfitIndex);
  const hatKey = hatTextureKey(selection.hatIndex);

  const rt = scene.make.renderTexture({ x: 0, y: 0, width: FRAME_SIZE * SHEET_COLS, height: FRAME_SIZE * SHEET_ROWS }, false);

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const col = frame % SHEET_COLS;
    const row = Math.floor(frame / SHEET_COLS);
    const x = col * FRAME_SIZE;
    const y = row * FRAME_SIZE;
    // z순서: body(0) < outfit(1) < hat(2) — GDD 4장 레이어 표.
    rt.drawFrame(bodyKey, frame, x, y);
    rt.drawFrame(outfitKey, frame, x, y);
    rt.drawFrame(hatKey, frame, x, y);
  }

  rt.saveTexture(outKey);
  const tex = scene.textures.get(outKey);
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const col = frame % SHEET_COLS;
    const row = Math.floor(frame / SHEET_COLS);
    tex.add(frame, 0, col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
  }

  rt.destroy();
}

export const DEFAULT_SELECTION: CustomizeSelection = { bodyIndex: 0, outfitIndex: 0, hatIndex: 0 };

/** 레지스트리 키 — CustomizeScene이 쓰고 GameScene/ResultScene이 읽는다. */
export const REGISTRY_SELECTION_KEY = 'customizeSelection';
export const PLAYER_TEXTURE_KEY = 'player_composite';
