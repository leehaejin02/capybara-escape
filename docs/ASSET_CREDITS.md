# ASSET CREDITS

> 외부 에셋·오픈소스를 **가져오는 순간** 여기에 적는다. 나중에 몰아서 추적하지 않는다.
> 대회 규정상 「AI 활용 기술 문서」에 명시가 **필수**이고, 무단 도용은 **선발 취소** 사유다.
> (CLAUDE.md 하네스 10·11, GDD 8장)

---

## 도구 (Tools)

게임에 포함되지 않고 **에셋 제작에만 쓰는** 소프트웨어. 심사자가 게임을 실행할 때는 필요하지 않다.

### sprite-gen

| 항목 | 내용 |
|---|---|
| 출처 | https://github.com/aldegad/sprite-gen |
| 라이선스 | **Apache-2.0** |
| 저자 | aldegad |
| 용도 | 스프라이트 팔레트 스왑(`recolor`), 아틀라스 베이크 |
| 저장소 포함 여부 | **미포함.** 저장소 밖에서 실행하고, 산출된 PNG만 커밋한다 |
| 도입일 | 2026-08-06 |

**쓰는 범위와 안 쓰는 범위 (2026-08-06 결정)**

- ✅ **쓴다**: AI가 필요 없는 **결정적(deterministic) 기능만** — `recolor`(팔레트 맵으로 N개 컬러웨이를 바이트 동일하게 굽기), 아틀라스 베이크
- ❌ **안 쓴다**: AI 이미지 생성 파이프라인. 이 도구가 지원하는 프로바이더는 `codex` / `grok`뿐인데
  이 환경에 둘 다 없고, 별도 유료 구독이 필요하다
- base 스프라이트는 **우리가 스크립트로 생성**한다 (GDD 8장 "코드/스크립트로 생성" 경로)

**Apache-2.0 준수 사항**: 저장소에 코드를 포함하지 않으므로 라이선스 전문 동봉 의무는 발생하지 않는다.
다만 산출물 제작에 사용했음을 위와 같이 명시한다. 이후 코드를 벤더링하게 되면 `LICENSE` 전문과
`NOTICE`를 함께 포함해야 한다.

### 검토했으나 채택하지 않은 것

| 도구 | 라이선스 | 미채택 사유 |
|---|---|---|
| [perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio) | MIT | 강점(8방향·100+ 액션)이 우리 요구(4방향 idle/walk)와 불일치. Go 1.25 + Wails 빌드 비용. Gemini/fal.ai 등 유료 API 키 필요. **2026-08-06 보류** |

---

## 게임에 포함되는 에셋 (Assets shipped in the build)

> 현재 **외부 에셋 0건**. 모든 스프라이트·타일은 스크립트로 생성한다.
> 외부 에셋을 하나라도 넣으면 아래 표에 출처·라이선스·수정 여부를 즉시 적는다.

| 파일 | 출처 | 라이선스 | 수정 여부 |
|---|---|---|---|
| _(없음)_ | — | — | — |

---

## 런타임 의존성 (Runtime dependencies)

빌드 결과물에 포함되거나 빌드에 필요한 npm 패키지.

| 패키지 | 라이선스 | 용도 |
|---|---|---|
| [phaser](https://github.com/phaserjs/phaser) | MIT | 게임 엔진 (런타임 포함) |
| [vite](https://github.com/vitejs/vite) | MIT | 번들러 (빌드 전용) |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 | 컴파일러 (빌드 전용) |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT | 타입 정의 (빌드 전용, 런타임 코드 없음) |

CI에서 쓰는 GitHub 공식 액션(`actions/checkout`, `actions/setup-node`)은 MIT이며 빌드 결과물에 포함되지 않는다.

---

## 폰트 · 사운드

| 항목 | 상태 |
|---|---|
| 폰트 | 현재 브라우저 기본 monospace만 사용. 외부 폰트 도입 시 여기에 적는다 |
| 사운드 | 현재 0건 (GDD 10장 SHOULD). 도입 시 CC0만 사용하고 여기에 적는다 |
