/**
 * recolor.mjs — capy_body 4계열 팔레트 스왑 (ART.md §1.4).
 *
 * 여기 구현된 recolorBuffer()는 sprite-gen의 `recolor --match exact` (변형 0)와 같은 규약을
 * 따른다: 불투명 픽셀의 RGB가 맵의 소스 hex와 **정확히** 같을 때만 치환하고, 알파는 그대로 둔다.
 * "동시 1패스" 요구(ART.md §1.4 경고 — dark→mid 결과가 같은 패스에서 mid→light로 다시 밀리면
 * 안 된다)는 원본 버퍼(rgba)만 읽고 새 버퍼(out)에만 쓰는 구조로 자동 충족된다 — out을 다시
 * 읽지 않으므로 순차 치환의 오염이 애초에 발생할 수 없다.
 *
 * 이 프로젝트가 커밋하는 capy_body_02~04.png의 실제 바이트는 이 함수가 만든다 —
 * `gen:sprites`가 npm 의존성·외부 실행 파일 없이 항상 재현 가능해야 하기 때문이다
 * (sprite-gen은 저장소에 포함하지 않는 도구다 — docs/ASSET_CREDITS.md).
 * 실제 sprite-gen `recolor` CLI로 같은 스펙을 한 번 구워 바이트 대조한 결과는
 * 세션 보고에 기록한다.
 */

import { hexToRgb, PALETTE } from './palette.mjs';

function toHexKey(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** name(팔레트 키) 맵을 hex 맵으로 변환. */
function resolveMap(nameMap) {
  const out = new Map();
  for (const [fromName, toName] of Object.entries(nameMap)) {
    const fromHex = PALETTE[fromName];
    const toHex = PALETTE[toName];
    if (!fromHex || !toHex) throw new Error(`recolor.mjs: 알 수 없는 팔레트 이름 (${fromName} -> ${toName})`);
    out.set(fromHex.toUpperCase(), hexToRgb(toHex));
  }
  return out;
}

/** rgba(Uint8ClampedArray) 버퍼를 nameMap에 따라 리컬러한 새 버퍼를 돌려준다. */
export function recolorBuffer(rgba, nameMap) {
  const table = resolveMap(nameMap);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    const mapped = a === 0 ? undefined : table.get(toHexKey(r, g, b));
    if (mapped) {
      out[i] = mapped[0];
      out[i + 1] = mapped[1];
      out[i + 2] = mapped[2];
      out[i + 3] = a;
    } else {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return out;
}

/** ART.md §1.4 표. body_01 자신은 항등(빈 맵). */
export const BODY_RECOLOR_MAPS = {
  capy_body_02: { capy_brown_dark: 'capy_brown_mid', capy_brown_mid: 'capy_brown_light' },
  capy_body_03: { capy_brown_dark: 'capy_gray_dark', capy_brown_mid: 'capy_gray_mid' },
  capy_body_04: { capy_brown_dark: 'capy_gray_mid', capy_brown_mid: 'capy_white' },
};
