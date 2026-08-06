/**
 * check-boundary.mjs — src/sim 의존 방향 검사기 (무의존, node:fs만 사용).
 *
 * ⚠️ 이 파일이 경계를 지키는 **유일한 실질적 게이트**다.
 * `tsconfig.sim.json`(2차로 불렸던 장치)은 설치된 npm 패키지(phaser 포함) import를
 * 막지 못함을 실측으로 확인했다 — TypeScript에는 "이 디렉터리에서 이 패키지 import 금지"
 * 옵션이 없다(`moduleResolution: "Classic"`은 TS7에서 제거됐고, `paths` 리맵도 매핑 실패 시
 * node 해석으로 폴백해 막지 못한다). 런타임 카나리(3차)는 import된 값이 실제로 코드에서
 * 참조될 때만 작동한다(사용되지 않은 import는 tsc가 컴파일 출력에서 지워버려 require 자체가
 * 실행되지 않는다). 즉 **이 스크립트가 죽으면 아무도 경계를 지키지 않는다.**
 * (2026-08-06 tech 실측, 좌표 director 재현 확인)
 *
 * 규칙:
 *  1. src/sim/**\/*.ts 는 src/sim/ 내부와 src/config/ 만 import할 수 있다.
 *     bare 지정자(phaser 포함), node:* 빌트인, src/scenes/, src/tools/ 는 전부 위반이다.
 *  2. src/config/**\/*.ts 는 아무것도 import하지 않는다 (순수 상수 파일).
 *
 * ── 인식하는 import 형태 (아래 6가지 — verify가 이 목록으로 누락을 대조한다) ──
 *  1. `import X from '...'`               (기본 import)
 *  2. `import type { X } from '...'`      (타입 전용 import 포함)
 *  3. `import '...'`                      (부수효과 전용, side-effect import)
 *  4. `export { X } from '...'` / `export * from '...'`
 *  5. `import('...')`                     (동적 import, await 여부 무관)
 *  6. `require('...')`
 * 여러 줄에 걸친 import 문(`import {\n  A,\n  B\n} from '...'`)도 인식한다 —
 * 줄 단위 정규식이 아니라 문자 단위 상태 기계로 스캔하기 때문이다.
 * 문자열/주석 내부의 가짜 import(`// import X from '...'`,
 * `const s = "import X from '...'"`)는 오탐하지 않는다 — 주석과 문자열 리터럴을
 * 상태 기계로 구분해서, 지정자로 인정하는 문자열은 오직 `from`/`import(`/`require(`/
 * `import<공백>` 바로 다음에 오는 것뿐이다.
 *
 * ── 알려진 한계 (고치지 않고 명시만 함) ──
 *  - 템플릿 리터럴로 된 동적 import 지정자(예: `import(\`phaser\`)`)는 감지하지 못한다.
 *    이 프로젝트 코드에서 쓰지 않으므로 실사용 리스크는 낮지만, 정적 텍스트 스캐너의
 *    구조적 한계다 — 백틱 안은 통째로 건너뛴다.
 *  - 변수·계산식으로 만든 지정자(예: `require(pkgName)`, `import(getPath())`)는
 *    애초에 문자열 리터럴이 아니라서 어떤 정적 스캐너로도 잡을 수 없다.
 *
 * 위반: `파일:줄 / 지정자 / 위반한 규칙` 을 stderr에 출력하고 exit 1.
 * 통과: 스캔한 파일 수를 stdout에 출력하고 exit 0 (침묵 통과 금지).
 * src/sim 스캔 파일이 0개면 통과시키지 않는다 — 경로 오타·리팩터링으로 폴더가
 * 옮겨졌는데 아무것도 안 읽고 초록불이 뜨는 게 가장 위험한 실패 모드이기 때문이다.
 */

import { readdirSync, readFileSync } from 'node:fs';

const SIM_ROOT = 'src/sim';
const CONFIG_ROOT = 'src/config';

/** dir(저장소 루트 기준 posix 상대경로) 아래 .ts 파일을 재귀적으로 찾는다. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...walk(rel));
    } else if (entry.isFile() && rel.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

/** filePath('a/b/c.ts')의 디렉터리 부분('a/b')을 반환한다. */
function dirOf(filePath) {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '.' : filePath.slice(0, idx);
}

/** baseDir 기준 상대 지정자 spec('./x', '../y/z')을 저장소 루트 기준 경로 문자열로 정리한다. */
function resolveRelative(baseDir, spec) {
  const segs = baseDir.split('/').filter(Boolean);
  for (const part of spec.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segs.pop();
    else segs.push(part);
  }
  return segs.join('/');
}

/**
 * codeTail(방금까지 지나온 코드 텍스트의 꼬리 일부)이 "지금 만난 문자열이
 * import/require의 지정자"라고 볼 수 있는 맥락으로 끝나는지 판정한다.
 */
function isSpecifierContext(codeTail) {
  return (
    /\bfrom\s*$/.test(codeTail) ||
    /\bimport\s*\(\s*$/.test(codeTail) ||
    /\brequire\s*\(\s*$/.test(codeTail) ||
    /\bimport\s+$/.test(codeTail)
  );
}

/**
 * 파일 내용을 문자 단위 상태 기계로 스캔해 import/export/require/동적 import의
 * 모듈 지정자와 줄 번호를 뽑는다.
 *
 * 줄 단위 정규식이 아니라 상태 기계인 이유: (1) 여러 줄에 걸친 import 문을 정확히
 * 처리하고, (2) 주석·문자열 리터럴 내부의 텍스트를 실제 코드와 구분해 오탐을 없애기
 * 위해서다 — 지정자로 인정하는 문자열은 오직 `isSpecifierContext()`가 참인 위치에서
 * 열린 문자열뿐이고, 그 문자열이 열리는 순간 이후의 내용(주석·다른 문자열)은
 * codeTail에 중립 토큰으로만 남아 다음 판정을 오염시키지 않는다.
 */
function extractSpecifiers(content) {
  const results = [];
  const n = content.length;
  let i = 0;
  let line = 1;
  let codeTail = '';

  const noteNewlines = (str) => {
    for (const ch of str) if (ch === '\n') line++;
  };

  while (i < n) {
    const c = content[i];
    const c2 = i + 1 < n ? content[i + 1] : '';

    // 줄 주석
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && content[j] !== '\n') j++;
      noteNewlines(content.slice(i, j));
      i = j;
      continue;
    }

    // 블록 주석
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(content[j] === '*' && content[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      noteNewlines(content.slice(i, j));
      i = j;
      continue;
    }

    // 문자열 리터럴 ('...' 또는 "...")
    if (c === "'" || c === '"') {
      const quote = c;
      const startLine = line;
      let j = i + 1;
      let strContent = '';
      while (j < n && content[j] !== quote) {
        if (content[j] === '\\') {
          strContent += content[j] + (content[j + 1] ?? '');
          j += 2;
          continue;
        }
        strContent += content[j];
        j++;
      }
      j = Math.min(j + 1, n); // 닫는 따옴표까지 소비
      noteNewlines(content.slice(i, j));

      if (isSpecifierContext(codeTail)) {
        results.push({ specifier: strContent, line: startLine });
      }
      // 이 문자열의 내용은 이후 판정을 오염시키지 않도록 중립 토큰만 남긴다
      // (문자열 안에 우연히 "from '...'" 같은 텍스트가 있어도 다음 판정에 영향 없음).
      codeTail = `${codeTail} "STR" `.slice(-40);
      i = j;
      continue;
    }

    // 템플릿 리터럴 — 통째로 건너뛴다 (알려진 한계: 상단 주석 참조)
    if (c === '`') {
      let j = i + 1;
      while (j < n && content[j] !== '`') {
        if (content[j] === '\\') {
          j += 2;
          continue;
        }
        j++;
      }
      j = Math.min(j + 1, n);
      noteNewlines(content.slice(i, j));
      codeTail = `${codeTail} \`TPL\` `.slice(-40);
      i = j;
      continue;
    }

    if (c === '\n') line++;
    codeTail = (codeTail + c).slice(-40);
    i++;
  }

  return results;
}

const violations = [];

function checkFile(filePath, isConfig) {
  const content = readFileSync(filePath, 'utf8');
  const specs = extractSpecifiers(content);
  for (const { specifier, line } of specs) {
    if (isConfig) {
      violations.push({
        file: filePath,
        line,
        specifier,
        rule: 'src/config/는 아무것도 import하지 않는다 (순수 상수)',
      });
      continue;
    }

    if (!specifier.startsWith('.')) {
      const rule = specifier.startsWith('node:')
        ? 'src/sim/은 node:* 빌트인을 import할 수 없다'
        : 'src/sim/은 bare 지정자(외부 패키지 포함)를 import할 수 없다';
      violations.push({ file: filePath, line, specifier, rule });
      continue;
    }

    const resolved = resolveRelative(dirOf(filePath), specifier);
    const allowed =
      resolved === SIM_ROOT ||
      resolved.startsWith(`${SIM_ROOT}/`) ||
      resolved === CONFIG_ROOT ||
      resolved.startsWith(`${CONFIG_ROOT}/`);

    if (!allowed) {
      violations.push({
        file: filePath,
        line,
        specifier,
        rule: 'src/sim/은 src/sim/ 내부와 src/config/만 import할 수 있다',
      });
    }
  }
}

const simFiles = walk(SIM_ROOT);
const configFiles = walk(CONFIG_ROOT);

if (simFiles.length === 0) {
  console.error(
    `check-boundary: 치명적 오류 — ${SIM_ROOT} 아래에서 스캔된 .ts 파일이 0개다.`
  );
  console.error(
    '경로 오타 또는 리팩터링으로 폴더가 옮겨져 검사기가 아무것도 읽지 못했을 가능성이 높다.'
  );
  console.error('이 상태로 통과시키는 것이 가장 위험한 실패 모드이므로 무조건 실패시킨다.');
  process.exit(1);
}

for (const f of simFiles) checkFile(f, false);
for (const f of configFiles) checkFile(f, true);

const scannedCount = simFiles.length + configFiles.length;

if (violations.length > 0) {
  console.error('check-boundary: 경계 위반 발견');
  for (const v of violations) {
    console.error(`${v.file}:${v.line} / ${v.specifier} / ${v.rule}`);
  }
  process.exit(1);
}

console.log(
  `check-boundary: OK — scanned ${scannedCount} files (src/sim: ${simFiles.length}, src/config: ${configFiles.length})`
);
process.exit(0);
