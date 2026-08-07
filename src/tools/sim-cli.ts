import { GOBLIN, HIDING, HIT, MISSION, PLAYER, ROUND, SIM, TARGET, WORLD } from '../config/balance';
import { createRng } from '../sim/rng';
import { runEpisode } from '../sim/world';
import { MAPS } from '../sim/map';
import type { SimResult } from '../sim/types';

/**
 * sim-cli — 헤드리스 시뮬 CLI. src/sim/ 바깥(src/tools/)에 둔다.
 * sim은 I/O·process·console을 몰라야 하므로, argv 파싱·stdout/stderr 출력은
 * 전부 이 파일이 담당하고 src/sim/은 순수 계산만 한다 (CLAUDE.md 아키텍처 1).
 *
 * ── STUB 해제 근거 (2026-08-06, tech) ──
 * 고블린 FSM(§4)·이동/충돌(§3)·시야(DDA 레이캐스트, §4.3~4.4)·미션 진행(§5)·승패 판정(§6)·
 * 봇 정책(§7)이 전부 `src/sim/`에 실제로 구현됐고, 이 CLI가 출력하는 지표는 그 계산 결과에서
 * 직접 나온다(하드코딩·스텁 없음). `src/sim/map.ts`·`src/sim/raycast.ts`는 모듈 로드 시(=이
 * 파일이 `runEpisode`를 import하는 시점) 각각 맵 불변식(MC1~MC13)·DDA 8케이스를 스스로
 * 단언하며, 실패하면 이 프로세스가 시뮬 실행 전에 예외로 죽는다 — 즉 아래 결과가 출력됐다는
 * 것 자체가 그 단언들을 통과했다는 뜻이다.
 *
 * ⚠️ §5.1의 알려진 괴리: sim은 미니게임을 재현하지 않고 "정해진 초 소비"로만 추상화한다.
 * 봇은 미니게임을 항상 정확히 규정 시간에 끝낸다고 가정하므로, 실제 사람의 클리어율은
 * 여기 나온 값보다 낮게 나올 수 있다(RULES.md §5.1).
 *
 * ── 맵 3종 (2026-08-07, docs/SPEC_MAPS.md) ──
 * `--map=<0|1|2>` 지정 시 모든 run이 그 맵을 강제로 쓴다(SPEC_MAPS.md O2 — §6.2 맵별 게이트
 * 측정에 필수). 미지정 시 각 run이 라운드 RNG로 맵을 무작위로 고르고(§1.4), 이 CLI는 그
 * 분포(O4)와 맵별 요약(O3)을 함께 출력한다.
 */

const USAGE = [
  '사용법: npm run sim -- [--runs=<int>] [--seed=<int>] [--map=<0|1|2>] [--json] [--assert]',
  '',
  '  --runs=<int>   반복 횟수 (1 이상). 기본값: SIM.DEFAULT_RUNS',
  '  --seed=<int>   RNG 시드. 기본값: SIM.DEFAULT_SEED(재현성)',
  `  --map=<int>    이 맵으로 강제(0..${MAPS.length - 1}). 미지정 시 라운드마다 무작위 선택`,
  '  --json         stdout에 JSON 객체 1개만 출력 (사람용 로그는 stderr)',
  '  --assert       exit 2 조건: (1) stuckRuns > 0 (봇 네비게이션 실패 — 밸런스 판정보다 먼저 검사)',
  '                 (2) TARGET 합격선 미달',
].join('\n');

interface ParsedArgs {
  runs: number;
  seed: number;
  map: number | null;
  json: boolean;
  assertFlag: boolean;
}

function printUsageAndExit(): never {
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv: string[]): ParsedArgs {
  let runs: number = SIM.DEFAULT_RUNS;
  let seed: number = SIM.DEFAULT_SEED;
  let map: number | null = null;
  let json = false;
  let assertFlag = false;

  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--assert') {
      assertFlag = true;
    } else if (arg.startsWith('--runs=')) {
      const value = Number(arg.slice('--runs='.length));
      if (!Number.isInteger(value) || value < 1) {
        printUsageAndExit();
      }
      runs = value;
    } else if (arg.startsWith('--seed=')) {
      const value = Number(arg.slice('--seed='.length));
      if (!Number.isInteger(value)) {
        printUsageAndExit();
      }
      seed = value;
    } else if (arg.startsWith('--map=')) {
      const value = Number(arg.slice('--map='.length));
      if (!Number.isInteger(value) || value < 0 || value >= MAPS.length) {
        printUsageAndExit();
      }
      map = value;
    } else {
      printUsageAndExit();
    }
  }

  return { runs, seed, map, json, assertFlag };
}

/** SPEC_MAPS.md O3: 맵별 클리어율 / 평균 완료 미션 수 / 패배 원인 비율. */
interface MapSummary {
  mapIndex: number;
  name: string;
  runs: number;
  clearRate: number;
  avgCompletedMissions: number;
  lossTimeout: number;
  lossHp0: number;
}

interface Metrics {
  seed: number;
  runs: number;
  /** null이면 --map 미지정(자유 선택). 지정됐으면 강제한 맵 index. */
  forcedMap: number | null;
  clearRate: number;
  avgTimeRemaining: number;
  avgHits: number;
  lossTimeout: number;
  lossHp0: number;
  timeoutLossShare: number | null;
  /** §8 위험#3 방어 — 60초 경과 후에도 완료 미션이 0인 판의 수. 0이어야 한다. */
  stuckRuns: number;
  /** §8 위험#1 방어 — steer() 3단(우회 커밋) 발동 횟수, 판당 평균/최대. */
  avgAvoidTriggerCount: number;
  maxAvoidTriggerCount: number;
  /** §8 위험#1 방어 — CHASE stuckSec 임계치 도달로 SEARCH 강제 전이한 횟수, 판당 평균/최대. */
  avgStuckAbortCount: number;
  maxStuckAbortCount: number;
  /** SPEC_MAPS.md O4: 맵 선택 분포(각 맵이 몇 번 뽑혔는지). --map 지정 시에도 참고용으로 낸다. */
  mapDistribution: number[];
  /** SPEC_MAPS.md O3: 맵별 요약. */
  perMap: MapSummary[];
}

function simulate(runs: number, seed: number, forcedMap: number | null): Metrics {
  const rng = createRng(seed);
  const results: SimResult[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(runEpisode(rng, forcedMap ?? undefined));
  }

  let clearedCount = 0;
  let timeRemainingClearedSum = 0;
  let hitsSum = 0;
  let lossTimeout = 0;
  let lossHp0 = 0;
  let stuckRuns = 0;
  let avoidSum = 0;
  let avoidMax = 0;
  let stuckAbortSum = 0;
  let stuckAbortMax = 0;

  const mapDistribution = MAPS.map(() => 0);
  const perMapCleared = MAPS.map(() => 0);
  const perMapCompletedSum = MAPS.map(() => 0);
  const perMapLossTimeout = MAPS.map(() => 0);
  const perMapLossHp0 = MAPS.map(() => 0);

  for (const r of results) {
    hitsSum += r.hits;
    if (r.cleared) {
      clearedCount++;
      timeRemainingClearedSum += r.timeRemainingSec;
    } else if (r.lossCause === 'timeout') {
      lossTimeout++;
    } else if (r.lossCause === 'hp0') {
      lossHp0++;
    }
    if (r.stuckRun) stuckRuns++;
    avoidSum += r.avoidTriggerCount;
    avoidMax = Math.max(avoidMax, r.avoidTriggerCount);
    stuckAbortSum += r.stuckAbortCount;
    stuckAbortMax = Math.max(stuckAbortMax, r.stuckAbortCount);

    mapDistribution[r.mapIndex]++;
    if (r.cleared) perMapCleared[r.mapIndex]++;
    perMapCompletedSum[r.mapIndex] += r.completedCount;
    if (r.lossCause === 'timeout') perMapLossTimeout[r.mapIndex]++;
    if (r.lossCause === 'hp0') perMapLossHp0[r.mapIndex]++;
  }

  const lossTotal = lossTimeout + lossHp0;

  const perMap: MapSummary[] = MAPS.map((m, i) => ({
    mapIndex: i,
    name: m.name,
    runs: mapDistribution[i],
    clearRate: mapDistribution[i] > 0 ? perMapCleared[i] / mapDistribution[i] : 0,
    avgCompletedMissions: mapDistribution[i] > 0 ? perMapCompletedSum[i] / mapDistribution[i] : 0,
    lossTimeout: perMapLossTimeout[i],
    lossHp0: perMapLossHp0[i],
  }));

  return {
    seed,
    runs,
    forcedMap,
    clearRate: runs > 0 ? clearedCount / runs : 0,
    avgTimeRemaining: clearedCount > 0 ? timeRemainingClearedSum / clearedCount : 0,
    avgHits: runs > 0 ? hitsSum / runs : 0,
    lossTimeout,
    lossHp0,
    timeoutLossShare: lossTotal > 0 ? lossTimeout / lossTotal : null,
    stuckRuns,
    avgAvoidTriggerCount: runs > 0 ? avoidSum / runs : 0,
    maxAvoidTriggerCount: avoidMax,
    avgStuckAbortCount: runs > 0 ? stuckAbortSum / runs : 0,
    maxStuckAbortCount: stuckAbortMax,
    mapDistribution,
    perMap,
  };
}

/** GDD 7장 목표 지표 대조. TIMEOUT_LOSS_SHARE는 오차 범위가 없어 게이트로 쓰지 않는다(balance.ts 주석). */
function isWithinTarget(m: Metrics): boolean {
  return (
    m.clearRate >= TARGET.CLEAR_RATE_MIN &&
    m.clearRate <= TARGET.CLEAR_RATE_MAX &&
    m.avgTimeRemaining >= TARGET.AVG_TIME_REMAINING_MIN_SEC &&
    m.avgTimeRemaining <= TARGET.AVG_TIME_REMAINING_MAX_SEC &&
    m.avgHits >= TARGET.AVG_HITS_MIN &&
    m.avgHits <= TARGET.AVG_HITS_MAX
  );
}

function printHuman(log: (line: string) => void, m: Metrics): void {
  log(`seed: ${m.seed}`);
  log(`runs: ${m.runs}`);
  log(`map: ${m.forcedMap === null ? '무작위(라운드 RNG)' : `강제 #${m.forcedMap}(${MAPS[m.forcedMap].name})`}`);
  log(`clearRate: ${(m.clearRate * 100).toFixed(1)}%`);
  log(`avgTimeRemaining: ${m.avgTimeRemaining.toFixed(1)}s`);
  log(`avgHits: ${m.avgHits.toFixed(2)}`);
  log(`lossCause: timeout ${m.lossTimeout} / hp0 ${m.lossHp0}`);
  log(
    `timeoutLossShare: ${m.timeoutLossShare === null ? 'n/a(패배 0건)' : `${(m.timeoutLossShare * 100).toFixed(1)}% (목표 ${(TARGET.TIMEOUT_LOSS_SHARE * 100).toFixed(0)}%, 게이트 아님·보고만)`}`
  );
  log(`stuckRuns: ${m.stuckRuns} (0이어야 한다 — §8 위험#3 방어)`);
  log(
    `avoidTriggerCount: avg ${m.avgAvoidTriggerCount.toFixed(1)} / max ${m.maxAvoidTriggerCount} (판당, §8 위험#1)`
  );
  log(
    `stuckAbortCount: avg ${m.avgStuckAbortCount.toFixed(2)} / max ${m.maxStuckAbortCount} (판당, §8 위험#1)`
  );
  log(`mapDistribution: ${m.mapDistribution.map((c, i) => `${MAPS[i].name}=${c}`).join(' / ')}`);
  log('perMap:');
  for (const s of m.perMap) {
    log(
      `  [${s.mapIndex}] ${s.name}: runs=${s.runs} clearRate=${(s.clearRate * 100).toFixed(1)}% ` +
        `avgCompletedMissions=${s.avgCompletedMissions.toFixed(2)} lossCause=timeout ${s.lossTimeout}/hp0 ${s.lossHp0}`
    );
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const metrics = simulate(args.runs, args.seed, args.map);

  if (args.json) {
    const balanceSnapshot = { SIM, PLAYER, HIT, GOBLIN, MISSION, HIDING, ROUND, WORLD, TARGET };
    const jsonOutput = {
      seed: metrics.seed,
      runs: metrics.runs,
      forcedMap: metrics.forcedMap,
      clearRate: metrics.clearRate,
      avgTimeRemaining: metrics.avgTimeRemaining,
      avgHits: metrics.avgHits,
      lossTimeout: metrics.lossTimeout,
      lossHp0: metrics.lossHp0,
      timeoutLossShare: metrics.timeoutLossShare,
      stuckRuns: metrics.stuckRuns,
      avgAvoidTriggerCount: metrics.avgAvoidTriggerCount,
      maxAvoidTriggerCount: metrics.maxAvoidTriggerCount,
      avgStuckAbortCount: metrics.avgStuckAbortCount,
      maxStuckAbortCount: metrics.maxStuckAbortCount,
      mapDistribution: metrics.mapDistribution,
      perMap: metrics.perMap,
      stub: false,
      balanceSnapshot,
    };
    console.log(JSON.stringify(jsonOutput));
  } else {
    printHuman(console.log, metrics);
  }

  if (args.assertFlag) {
    // §8 위험#3: 봇이 멈춘 판이 있으면 밸런스 판정보다 먼저 실패시킨다.
    if (metrics.stuckRuns > 0) {
      process.exit(2);
    }
    if (!isWithinTarget(metrics)) {
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
