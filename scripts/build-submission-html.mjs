/**
 * build-submission-html.mjs — 제출용 마크다운 원고를 "인쇄 가능한 HTML"로 변환한다.
 *
 * 왜 이런 방식인가
 * ----------------
 * 제출물 3·4번은 PDF여야 한다. 그런데 하네스 8에 따라 Phaser·Vite·TypeScript 외의
 * npm 의존성은 승인 없이 추가하지 않는다 — md-to-pdf나 puppeteer를 넣지 않는다는 뜻이다.
 * 그래서 변환을 두 단계로 쪼갠다:
 *
 *   1) 이 스크립트가 마크다운 → 인쇄용 HTML (의존성 0개, Node 기본 모듈만)
 *   2) 사람이 Chrome에서 열어 Ctrl+P → "PDF로 저장" (A4 여백·페이지 나눔은 @page CSS가 이미 잡아 둠)
 *
 * 2단계를 사람이 하는 건 우회가 아니라 의도다. 하네스 12·14가 요구하는 "실제 산출물을 눈으로
 * 확인한다"를 강제하고, 헤드리스 브라우저 의존성을 저장소에 들이지 않는다.
 *
 * 지원하는 마크다운 범위
 * ----------------------
 * 원고 2종이 실제로 쓰는 문법만 지원한다(측정 후 결정, 과하게 만들지 않았다):
 * 제목 h1~h4 / 수평선 / 코드펜스 / GFM 파이프 표 / 인용 / 순서·비순서 목록 / 문단,
 * 인라인은 **강조** · `코드` · [링크](url) · ~~취소선~~.
 * **중첩 목록은 두 원고에 존재하지 않으므로 지원하지 않는다** — 나중에 쓰면 평문으로 떨어진다.
 *
 * 스크린샷 주입
 * -------------
 * 원고의 `TODO(코디네이터) — **스크린샷 A: ...**` 줄을 찾아,
 * `docs/screenshots/A.png`가 있으면 그 이미지를 data URI로 인라인하고,
 * 없으면 **빨간 자리표시자 박스**를 그린다. 자리표시자가 하나라도 남으면 스크립트가
 * 경고를 출력하고 종료 코드 1로 끝난다 — 빈 자리를 못 보고 PDF로 굳히는 사고를 막는다.
 *
 * 사용법: npm run build:submission
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const SHOTS = join(DOCS, 'screenshots');
const OUT = join(ROOT, 'dist-submission');

/** 변환 대상. title은 PDF 첫 페이지 제목이자 브라우저 인쇄 헤더에 쓰인다. */
const TARGETS = [
  { src: 'SUBMISSION_GAME_INTRO.md', out: 'game-intro.html', title: '이세계 카피바라 — 게임 소개 및 설명' },
  { src: 'SUBMISSION_AI_TECH.md', out: 'ai-tech.html', title: '이세계 카피바라 — AI 활용 기술 문서' },
  { src: 'SUBMISSION_TEAM_ROLES.md', out: 'team-roles.html', title: '이세계 카피바라 — 팀원 롤 기술서' },
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// ── 유틸 ──

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 인라인 문법 변환. **코드 스팬을 가장 먼저 떼어내 자리표시자로 치환**한 뒤 나머지를 처리한다 —
 * 그러지 않으면 `**bold**` 같은 문자열이 코드 안에 있어도 강조로 먹혀 코드가 깨진다.
 */
function inline(src) {
  const spans = [];
  let s = src.replace(/`([^`]+)`/g, (_, code) => {
    spans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });

  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src2) => `<img alt="${alt}" src="${src2}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 굵게를 먼저 소비했으므로 남은 홑따옴표 별표 쌍만 기울임이다. 순서를 뒤집으면 **굵게**가
  // *굵게* 두 개로 잘못 잘린다.
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

/** 이미지를 data URI로 인라인한다. 외부 파일 참조가 남으면 PDF에 그림이 안 실린다. */
function dataUri(file) {
  const ext = extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null;
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

/** docs/screenshots/ 에서 A~D 라벨에 해당하는 파일을 찾는다. `A.png`, `A-title.png` 둘 다 허용. */
function findShot(label) {
  if (!existsSync(SHOTS)) return null;
  const hit = readdirSync(SHOTS).find(
    (f) => MIME[extname(f).toLowerCase()] && new RegExp(`^${label}([-_.]|$)`, 'i').test(f)
  );
  return hit ? join(SHOTS, hit) : null;
}

// ── 블록 파서 ──

/** 표 구분행(`|---|:--:|`)인지. 이게 있어야 파이프 줄을 표로 인정한다. */
function isTableDivider(line) {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * 스크린샷 자리 표시 줄인지 판정하고, 맞으면 라벨(A~D)과 설명을 돌려준다.
 * 원고 형식: `TODO(코디네이터)` — **스크린샷 A: 타이틀 화면** (부연)
 */
function parseShotMarker(line) {
  if (!/TODO\(코디네이터\)/.test(line)) return null;
  // A~E. 처음엔 A~D로 짰다가 §8이 결과 화면(E)까지 5장을 요구하는 것을 놓쳐 한 장이 조용히
  // 빠졌다. 라벨을 늘릴 때 여기와 docs/screenshots/README.md를 같이 고쳐야 한다.
  const m = line.match(/스크린샷\s*([A-Ea-e])\s*[:：]\s*([^*]+)/);
  if (!m) return null;
  return { label: m[1].toUpperCase(), caption: m[2].trim() };
}

const missing = [];
/** 이미지가 실제로 들어간 스크린샷 자리 수. 아래 TODO 집계에서 빼기 위해 센다 —
 *  채워진 자리까지 "남은 TODO"로 세면 영원히 0이 되지 않는다. */
let shotsResolved = 0;

function renderShot(label, caption) {
  const file = findShot(label);
  if (file) {
    const uri = dataUri(file);
    if (uri) {
      shotsResolved += 1;
      return `<figure class="shot"><img src="${uri}" alt="스크린샷 ${label}"><figcaption>스크린샷 ${label} — ${escapeHtml(caption)}</figcaption></figure>`;
    }
  }
  missing.push(`${label} (${caption})`);
  return `<div class="shot-missing"><strong>스크린샷 ${label} 없음</strong><span>${escapeHtml(caption)}</span><span class="hint">docs/screenshots/${label}.png 로 저장하면 자동으로 들어갑니다</span></div>`;
}

/** 마크다운 블록 → HTML. 인용 안쪽은 같은 함수를 재귀 호출해 표·목록이 살아 있게 한다. */
function toHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄
    if (!line.trim()) { i += 1; continue; }

    // 코드펜스
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1; // 닫는 펜스
      out.push(`<pre class="code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 수평선
    if (/^-{3,}$/.test(line.trim())) { out.push('<hr>'); i += 1; continue; }

    // 제목
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // 인용 — 연속된 `>` 줄을 모아 접두사를 떼고 재귀 변환
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${toHtml(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 표 — 현재 줄이 파이프로 시작하고 다음 줄이 구분행일 때만
    if (/^\|/.test(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i += 1; }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const tb = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    // 목록 (중첩 없음 — 원고에 존재하지 않는다)
    const isUl = (l) => /^\s*[-*]\s+/.test(l);
    const isOl = (l) => /^\s*\d+\.\s+/.test(l);
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const same = ordered ? isOl : isUl;
      const items = [];
      while (i < lines.length && same(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // 스크린샷 자리
    const shot = parseShotMarker(line);
    if (shot) { out.push(renderShot(shot.label, shot.caption)); i += 1; continue; }

    // 문단 — 빈 줄/블록 시작 전까지 이어 붙인다
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|\||```|-{3,}$)/.test(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      const text = para.join('\n');
      const s = parseShotMarker(text);
      out.push(s ? renderShot(s.label, s.caption) : `<p>${inline(text)}</p>`);
    }
  }

  return out.join('\n');
}

// ── 인쇄용 셸 ──

/**
 * @page로 A4·여백을 잡는다. 브라우저 인쇄 대화상자에서 "배경 그래픽"을 켜야 표 머리·인용
 * 배경이 나온다 — 안내 배너를 화면에만 띄우고(@media print에서 숨김) 인쇄물에는 넣지 않는다.
 */
function shell(title, body) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  :root { --ink:#1b1b1f; --muted:#5b5b66; --line:#d8d8e0; --accent:#b26a00; --bg-soft:#f6f6f9; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; max-width: 820px; padding: 24px;
    font-family: "Pretendard", "Malgun Gothic", "맑은 고딕", system-ui, sans-serif;
    font-size: 10.5pt; line-height: 1.65; color: var(--ink); background: #fff;
    word-break: keep-all; overflow-wrap: anywhere;
  }
  .print-hint {
    background: #fff4e0; border: 1px solid var(--accent); border-radius: 6px;
    padding: 10px 14px; margin-bottom: 20px; font-size: 10pt; color: #6b3f00;
  }
  h1 { font-size: 20pt; margin: 0 0 4px; border-bottom: 3px solid var(--accent); padding-bottom: 8px; }
  h2 { font-size: 14pt; margin: 26px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 18px 0 6px; color: #2c2c38; }
  h4 { font-size: 10.5pt; margin: 14px 0 4px; color: var(--muted); }
  h1,h2,h3,h4 { break-after: avoid; page-break-after: avoid; }
  p { margin: 8px 0; }
  ul,ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
  a { color: #1a5fb4; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 9.5pt;
         background: var(--bg-soft); padding: 1px 4px; border-radius: 3px; }
  pre.code { background: var(--bg-soft); border: 1px solid var(--line); border-radius: 5px;
             padding: 10px 12px; overflow-x: auto; break-inside: avoid; page-break-inside: avoid; }
  pre.code code { background: none; padding: 0; font-size: 9pt; line-height: 1.5; }
  blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid var(--accent);
               background: #fbf7f0; break-inside: avoid; page-break-inside: avoid; }
  blockquote > :first-child { margin-top: 0; }
  blockquote > :last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt;
          break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; }
  thead th { background: var(--bg-soft); font-weight: 600; }
  figure.shot { margin: 16px 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  figure.shot img { max-width: 100%; border: 1px solid var(--line); border-radius: 4px;
                    image-rendering: pixelated; }
  figcaption { font-size: 9pt; color: var(--muted); margin-top: 6px; }
  .shot-missing { border: 2px dashed #c0392b; border-radius: 6px; padding: 18px; margin: 16px 0;
                  text-align: center; color: #c0392b; display: flex; flex-direction: column; gap: 4px;
                  break-inside: avoid; }
  .shot-missing .hint { font-size: 9pt; color: var(--muted); }
  @media print { .print-hint { display: none; } body { padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="print-hint">
  <strong>PDF로 저장하는 법</strong> — Chrome에서 <strong>Ctrl+P</strong> →
  대상 <strong>“PDF로 저장”</strong> → 용지 <strong>A4</strong> →
  <strong>“배경 그래픽” 체크</strong>(표·인용 배경이 나오게) → 저장.
  이 안내 상자는 인쇄물에는 나오지 않습니다.
</div>
${body}
</body>
</html>
`;
}

// ── 실행 ──

mkdirSync(OUT, { recursive: true });

for (const t of TARGETS) {
  const src = join(DOCS, t.src);
  if (!existsSync(src)) {
    console.error(`build-submission: 원고 없음 — ${t.src}`);
    process.exit(1);
  }
  const html = shell(t.title, toHtml(readFileSync(src, 'utf8')));
  writeFileSync(join(OUT, t.out), html, 'utf8');
  console.log(`build-submission: ${t.src} -> dist-submission/${t.out} (${(html.length / 1024).toFixed(0)}KB)`);
}

// 남은 TODO 마커도 같이 센다 — 스크린샷 외의 미기입도 PDF 직전에 잡아야 한다.
// 이미 이미지가 들어간 스크린샷 자리는 뺀다(원문에는 마커 문자열이 그대로 남아 있다).
const todoRaw = TARGETS.reduce((n, t) => {
  const body = readFileSync(join(DOCS, t.src), 'utf8');
  return n + (body.match(/TODO\(코디네이터\)/g) || []).length;
}, 0);
const todoLeft = todoRaw - shotsResolved;

console.log(
  `build-submission: 스크린샷 ${shotsResolved}장 삽입됨 · 남은 TODO(코디네이터) ${todoLeft}건 (원문 마커 ${todoRaw})`
);

if (missing.length) {
  console.error(`\nbuild-submission: 스크린샷 ${missing.length}장이 비어 있습니다 — 이대로 PDF를 만들면 빨간 자리표시자가 그대로 실립니다.`);
  for (const m of missing) console.error(`  - 스크린샷 ${m}`);
  console.error(`\n  docs/screenshots/ 에 A.png ~ D.png 로 저장한 뒤 다시 실행하세요.`);
  process.exit(1);
}

if (todoLeft > 0) {
  console.error(`\nbuild-submission: TODO(코디네이터)가 ${todoLeft}건 남아 있습니다. 채우고 다시 실행하세요.`);
  process.exit(1);
}

console.log('build-submission: OK — 비어 있는 자리 없음.');
