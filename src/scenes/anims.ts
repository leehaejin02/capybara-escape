import Phaser from 'phaser';

/**
 * anims.ts — 4방향 걷기 애니메이션 등록 헬퍼.
 *
 * 애니메이션 프레임레이트는 밸런스 수치가 아니다(이동 속도·판정에 영향 없는 순수 표현 값) —
 * balance.ts 대상이 아니다. docs/ART.md §2.1: frameIndex = dir*COLS + frame,
 * dir 고정값(0=down,1=up,2=left,3=right).
 */

/** 걷기 애니메이션 표현용 프레임레이트(fps). 게임 판정과 무관한 순수 표시값. */
const WALK_ANIM_FRAME_RATE = 8;

/** dir(0..3) → 그 방향의 idle(정지) 프레임 인덱스. ART.md §3.1 "idle = 해당 방향의 프레임 0 고정". */
export function idleFrame(dir: number, colsPerRow: number): number {
  return dir * colsPerRow;
}

/**
 * `textureKey`(4×4, 16프레임) 스프라이트시트에 4방향 걷기 애니메이션을 등록한다.
 * `keyPrefix`로 애니메이션 키 이름공간을 나눈다(플레이어/고블린이 같은 매니저를 공유하므로).
 *
 * `force=false`(기본): 이미 등록돼 있으면 다시 만들지 않는다(씬 재시작 시 중복 생성 방지) —
 * `goblin_walk`처럼 텍스처 객체가 게임 내내 그대로인 경우에 쓴다.
 *
 * `force=true`: 이미 등록돼 있어도 **지우고 다시 만든다.** `player_composite`처럼 매 판
 * `bakeCompositeTexture`가 같은 키로 텍스처를 파괴 후 재생성하는 경우 반드시 필요하다 —
 * `Phaser.Animations.AnimationFrame`은 생성 시점의 `Textures.Frame` 객체 참조를 그대로
 * 캐시해 두므로(런타임 조회가 아니다), 텍스처가 재생성됐는데 애니메이션을 재사용하면
 * 이미 파괴된 프레임 객체를 계속 가리키게 된다(재시작 후 이전 조합의 낡은 프레임을
 * 그리거나 깨지는 버그). AnimationFrame.js 실측으로 확인했다.
 */
export function ensureWalkAnims(scene: Phaser.Scene, textureKey: string, keyPrefix: string, force = false): void {
  const dirs: Array<{ name: string; row: number }> = [
    { name: 'down', row: 0 },
    { name: 'up', row: 1 },
    { name: 'left', row: 2 },
    { name: 'right', row: 3 },
  ];
  for (const { name, row } of dirs) {
    const key = `${keyPrefix}_walk_${name}`;
    if (scene.anims.exists(key)) {
      if (!force) continue;
      scene.anims.remove(key);
    }
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: row * 4, end: row * 4 + 3 }),
      frameRate: WALK_ANIM_FRAME_RATE,
      repeat: -1,
    });
  }
}

export function walkAnimKey(keyPrefix: string, dir: number): string {
  const names = ['down', 'up', 'left', 'right'];
  return `${keyPrefix}_walk_${names[dir]}`;
}

/** 4방향 단위 벡터를 스프라이트 행 인덱스(0=down,1=up,2=left,3=right)로 양자화한다.
 * RULES.md §3.1과 같은 규칙(우세축 기준)이지만 여기서는 **렌더 전용**이다 — 판정에 쓰지 않는다. */
export function dirRowFromFacing(facing: { x: number; y: number }): number {
  if (Math.abs(facing.x) >= Math.abs(facing.y)) {
    return facing.x > 0 ? 3 : 2;
  }
  return facing.y > 0 ? 0 : 1;
}
