import { GOBLIN, HIT, HIDING, MISSION, PLAYER, ROUND, SIM, TARGET, WORLD } from '../config/balance';
import { createRng } from '../sim/rng';
import { runEpisode } from '../sim/world';
import type { SimResult } from '../sim/types';

/**
 * sim-cli — 헤드리스 시뮬 CLI. src/sim/ 바깥(src/tools/)에 둔다.
 * sim은 I/O·process·console을 몰라야 하므로, argv 파싱·stdout/stderr 출력은
 * 전부 이 파일이 담당하고 src/sim/은 순수 계산만 한다 (CLAUDE.md 아키텍처 1).
 *
 * ⚠️ 스캐폴딩 단계: 고블린 FSM·미션·충돌·승패 판정이 src/sim/에 아직 없다.
 * 이 CLI가 내는 모든 지표는 STUB이며 밸런싱 근거로 쓸 수 없다 (DECISIONS D5).
 * STUB 플래그는 게임 규칙이 실제로 구현되면 tech가 명시적으로 내린다.
 */

/** 스캐폴딩 단계 STUB 플래그. gd/verify가 이 상수 하나로 "아직 규칙 미구현"을 판별한다. */
const STUB = true;

/**
 * `--seed` 미지정 시 기본값. balance.ts에 없는 값이다 — 밸런스 수치가 아니라
 * CLI 재현성을 위한 도구 상수이기 때문이다(속도·시야·제한시간·쿨다운이 아님).
 * `Date.now()` 금지 규칙(CLI 계약)에 따라 고정 상수로 둔다.
 */
const DEFAULT_SEED = 20260806;

const BANNER = '!! STUB — game rules not implemented. Metrics are NOT valid for balancing.';

const USAGE = [
  '사용법: npm run sim -- [--runs=<int>] [--seed=<int>] [--json] [--assert]',
  '',
  '  --runs=<int>   반복 횟수 (1 이상). 기본값: SIM.DEFAULT_RUNS',
  '  --seed=<int>   RNG 시드. 기본값: 고정 상수(재현성)',
  '  --json         stdout에 JSON 객체 1개만 출력 (사람용 로그는 stderr)',
  '  --assert       지표가 TARGET 합격선을 벗어나면 exit 2 (STUB인 동안은 항상 exit 2)',
].join('\n');

interface ParsedArgs {
  runs: number;
  seed: number;
  json: boolean;
  assertFlag: boolean;
}

function printUsageAndExit(): never {
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv: string[]): ParsedArgs {
  let runs: number = SIM.DEFAULT_RUNS;
  let seed: number = DEFAULT_SEED;
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
    } else {
      printUsageAndExit();
    }
  }

  return { runs, seed, json, assertFlag };
}

interface Metrics {
  seed: number;
  runs: number;
  clearRate: number;
  avgTimeRemaining: number;
  avgHits: number;
  lossTimeout: number;
  lossHp0: number;
  stub: boolean;
}

function simulate(runs: number, seed: number): Metrics {
  const rng = createRng(seed);
  const results: SimResult[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(runEpisode(rng));
  }

  let clearedCount = 0;
  let timeRemainingClearedSum = 0;
  let hitsSum = 0;
  let lossTimeout = 0;
  let lossHp0 = 0;

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
  }

  return {
    seed,
    runs,
    clearRate: runs > 0 ? clearedCount / runs : 0,
    avgTimeRemaining: clearedCount > 0 ? timeRemainingClearedSum / clearedCount : 0,
    avgHits: runs > 0 ? hitsSum / runs : 0,
    lossTimeout,
    lossHp0,
    stub: STUB,
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
  log(`clearRate: ${(m.clearRate * 100).toFixed(1)}%`);
  log(`avgTimeRemaining: ${m.avgTimeRemaining.toFixed(1)}s`);
  log(`avgHits: ${m.avgHits.toFixed(2)}`);
  log(`lossCause: timeout ${m.lossTimeout} / hp0 ${m.lossHp0}`);
  log(`stub: ${m.stub}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const metrics = simulate(args.runs, args.seed);

  // 사람이 읽는 배너는 항상 stderr — --json 모드에서 stdout은 JSON 객체 1개여야 한다.
  console.error(BANNER);

  if (args.json) {
    const balanceSnapshot = { SIM, PLAYER, HIT, GOBLIN, MISSION, HIDING, ROUND, WORLD, TARGET };
    const jsonOutput = {
      seed: metrics.seed,
      runs: metrics.runs,
      clearRate: metrics.clearRate,
      avgTimeRemaining: metrics.avgTimeRemaining,
      avgHits: metrics.avgHits,
      lossTimeout: metrics.lossTimeout,
      lossHp0: metrics.lossHp0,
      stub: metrics.stub,
      balanceSnapshot,
    };
    console.log(JSON.stringify(jsonOutput));
  } else {
    console.log(BANNER);
    printHuman(console.log, metrics);
  }

  if (args.assertFlag) {
    // D5: STUB인 동안은 --assert가 무조건 exit 2다. 지표 판정은 STUB 해제 후에만 의미가 있다.
    if (metrics.stub || !isWithinTarget(metrics)) {
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
