/**
 * common.ts — 미션 미니게임 3종(M1 배선 / M2 온도 / M3 순서 기억)의 공유 타입·색·순열 유틸.
 *
 * ── 아키텍처 계약 (CLAUDE.md 하네스 1·3, RULES.md §5.1) ──
 * 미니게임은 **렌더 레이어**다. 미션의 완료 판정은 전부 sim이 한다
 * (`player.missionSec >= durationOf(type)` — `src/sim/mission.ts`).
 * 미니게임이 sim에 영향을 줄 수 있는 통로는 단 하나, **sim의 공식 입력**뿐이다:
 * 실패 시 `MinigameOverlay`가 "자발적 중단 = 이동 입력"(RULES.md §5.4 bullet 2)을
 * 1틱 주입해 진행도를 0으로 되돌린다. 그 외에는 sim 상태를 읽어 그리기만 한다.
 *
 * 색은 밸런스가 아니고(ART.md §1 계약 1) 전부 `scenes/palette.ts`(= ART.md §1.1의 사본)에서
 * 가져온다. 팔레트 16색 밖의 색은 쓰지 않는다.
 */
import type Phaser from 'phaser';
import { UI_HEX } from '../palette';

/** 미니게임 한 프레임 갱신의 결과. 'fail'만이 sim에 영향(중단 입력 주입)을 일으킨다. */
export type MinigameTickResult =
  | { kind: 'ongoing' }
  /** 조작은 전부 끝났고 sim의 missionSec이 duration에 차기를 기다리는 상태(짧은 꼬리). */
  | { kind: 'solved' }
  | { kind: 'fail'; reason: string };

export interface MinigameView {
  /**
   * 매 렌더 프레임 호출. `missionSec`은 **sim의 진행도(진실의 원천)**이고,
   * 미니게임의 모든 타임라인(활성화·마감·점멸)은 이 값의 함수다 — 벽시계를 따로 두지 않는다.
   * 그래서 피격/중단으로 sim이 리셋되면(missionIndex=null) 미니게임도 자동으로 함께 사라진다.
   */
  update(missionSec: number): MinigameTickResult;
  /** 입력 리스너·키 등록 해제. 표시 객체는 컨테이너 파괴가 함께 지운다. */
  destroy(): void;
}

/** MinigameOverlay가 각 미니게임 뷰에 넘기는 컨텍스트. */
export interface MinigameContext {
  scene: Phaser.Scene;
  /** 패널 컨테이너(화면 고정, scrollFactor 0). 뷰는 여기에 자기 표시 객체를 add한다. */
  container: Phaser.GameObjects.Container;
  /** 패널 내부 크기 (px, 컨테이너 로컬 좌표). */
  width: number;
  height: number;
  /** 이 미션 타입의 sim 소요 시간 = balance.ts `MISSION.M*_DURATION_SEC`. */
  durationSec: number;
  /** 배치 결정용 시드(미션 index + 재시도 횟수). 밸런스가 아니라 재현 가능한 배치 선택값. */
  seed: number;
}

/**
 * M1 전선 / M3 아이콘의 4색 구분 세트. 전부 ART.md §1.1 팔레트 안이다.
 * 명도(L): amber 183 / goblinMid 177 / tileSpa 109 / capyWhite 236 — amber↔goblinMid는
 * 명도가 비슷하지만 색상(주황↔초록)이 보색권이라 구분된다(§1.2 "알려진 약한 쌍"과 같은 논리).
 */
export const MINIGAME_COLOR_SET: readonly number[] = [
  UI_HEX.accentAmber,
  UI_HEX.goblinMid,
  UI_HEX.tileSpa,
  UI_HEX.capyWhite,
];

/** [0,1,2,3]의 전체 순열 24개 (사전식). 모듈 로드 시 1회 생성. */
const PERMS_4: number[][] = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]): void => {
    if (rest.length === 0) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      rec([...cur, rest[i]], rest.filter((_, k) => k !== i));
    }
  };
  rec([], [0, 1, 2, 3]);
  return out;
})();

const PERMS_4_NON_IDENTITY: number[][] = PERMS_4.filter((p) => !p.every((v, i) => v === i));

/**
 * 시드로 [0..3] 순열 하나를 결정적으로 고른다. `Math.random()`을 쓰지 않는 이유:
 * 렌더 레이어라 sim 재현성(RULES.md §5.6)과 무관하지만, "같은 시드 = 같은 배치"가
 * 버그 재현·영상 촬영에 공짜로 도움이 되고 비용이 0이다.
 * `excludeIdentity`: M1에서 항등 순열(직선 연결 4개)은 조작 난이도가 0이라 제외한다.
 */
export function permutation4(seed: number, excludeIdentity = false): readonly number[] {
  const list = excludeIdentity ? PERMS_4_NON_IDENTITY : PERMS_4;
  const idx = ((seed % list.length) + list.length) % list.length;
  return list[idx];
}
