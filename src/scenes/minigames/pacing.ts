/**
 * pacing.ts — 미니게임 3종의 시간 페이싱 상수. 전부 **sim 소요시간 T(= balance.ts의
 * `MISSION.M*_DURATION_SEC`)에 대한 비율**이다. gd가 T를 바꾸면 페이싱이 자동으로 따라간다.
 *
 * ── 왜 이 값들이 balance.ts에 없는가 ──
 * GDD 5장·RULES.md §5.1이 명시한 결정: "sim은 미니게임을 재현하지 않는다. 미니게임의
 * 조작 난이도는 밸런스 축이 아니고, 난이도 차이는 소요 시간 차이(10/8/12초)로만 표현된다."
 * 즉 이 파일의 비율은 playtest가 튜닝하는 밸런스 수치가 아니라 **렌더 레이어의 조작 페이싱**이다.
 * (balance.ts는 gd 소유라 tech가 추가할 수도 없다 — 밸런스로 승격하려면 gd를 거친다.)
 *
 * ── 시간 정합성 설계 (이 프로젝트에서 이 파일이 지키는 단 하나의 불변식) ──
 * sim은 미션을 "정확히 T초 소비"로 본다. 미니게임은 그 T를 바꿀 수 없다(sim 수정 금지).
 * 따라서:
 *   - 완료는 항상 sim이 T에 판정한다. 미니게임을 아무리 잘해도 T보다 빨리 끝나지 않는다.
 *   - 대신 실패(오조작·방치)는 진행도 리셋(자발적 중단 입력 주입)으로 이어진다.
 *   - **모든 실패 마감 시점은 반드시 T보다 앞선다** — 어기면 "미니게임을 무시해도
 *     sim이 먼저 완료해 버리는 무료 통과"가 생긴다. 아래 로드 시 단언이 이를 지킨다.
 */

// ── M1 배선 잇기 (T = MISSION.M1_WIRING_DURATION_SEC, 10초) ─────────────────
/** k번째(0..3) 전선이 활성화되는 시점 = k * 이 값 * T. (0 / 2 / 4 / 6초 @T=10) */
export const M1_ACTIVATION_INTERVAL_FRAC = 0.2;
/** 활성화 후 이 값 * T 안에 연결해야 한다. 마지막 마감 = (3*0.2 + 0.35) = 0.95T < T. */
export const M1_WIRE_DEADLINE_FRAC = 0.35;

// ── M2 온천 온도 맞추기 (T = MISSION.M2_TEMPERATURE_DURATION_SEC, 8초) ──────
/** 라운드 1개의 창 길이 = 이 값 * T. 3라운드가 [0, 0.9T)를 차지한다. */
export const M2_ROUND_FRAC = 0.3;
/** 초록 구간의 폭 (바 전체 대비 비율). 시간으로는 약 0.18 * 0.3T ≈ 0.43초 창. */
export const M2_ZONE_WIDTH_FRAC = 0.18;
/** 라운드별 초록 구간 시작 위치 후보. (seed + round)로 순환 선택. start + width ≤ 0.84 < 1. */
export const M2_ZONE_STARTS: readonly number[] = [0.5, 0.66, 0.58, 0.44];

// ── M3 순서 기억 (T = MISSION.M3_MEMORY_DURATION_SEC, 12초) ─────────────────
/** 점멸(암기) 페이즈 길이 = 이 값 * T. 4슬롯 × (T/12)씩 점멸한다. (4초 @T=12) */
export const M3_FLASH_PHASE_FRAC = 1 / 3;
/** 각 점멸 슬롯 안에서 실제로 밝게 켜져 있는 비율 (나머지는 소등 간격). */
export const M3_FLASH_ON_FRAC = 0.7;
/** 입력 페이즈의 끝 = 이 값 * T. n번째 클릭 마감은 이 구간을 4등분해 배정. 11/12T < T. */
export const M3_INPUT_END_FRAC = 11 / 12;

// ── 로드 시 단언: 실패 마감 < T ──────────────────────────────────────────────
// 조용히 틀리는 대신 시끄럽게 죽는다(RULES.md §1 tech 필수 단언과 같은 태도).
const M1_LAST_DEADLINE_FRAC = 3 * M1_ACTIVATION_INTERVAL_FRAC + M1_WIRE_DEADLINE_FRAC;
const M2_LAST_DEADLINE_FRAC = (2 + Math.max(...M2_ZONE_STARTS) + M2_ZONE_WIDTH_FRAC) * M2_ROUND_FRAC;
if (M1_LAST_DEADLINE_FRAC >= 1 || M2_LAST_DEADLINE_FRAC >= 1 || M3_INPUT_END_FRAC >= 1) {
  throw new Error(
    `[minigames/pacing] 실패 마감이 sim 소요시간(T)을 넘는다 — 미니게임 무시 무료 통과가 생긴다. ` +
      `M1=${M1_LAST_DEADLINE_FRAC} M2=${M2_LAST_DEADLINE_FRAC} M3=${M3_INPUT_END_FRAC}`,
  );
}
