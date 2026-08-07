# RULES — sim 게임 규칙 스펙

> 작성: `gd` / 2026-08-06 / 대상: `tech` 구현, `playtest` 시뮬, `verify` 대조
> 상위 문서: `docs/GDD.md` (무엇을 만드는가) → **이 문서** (어떤 규칙으로) → `src/config/balance.ts` (수치)

## 이 문서의 계약

1. **여기 적힌 모든 판정은 Phaser 없이 Node에서 숫자만으로 계산 가능하다.**
   렌더링·입력 디바이스·애니메이션에 의존하는 규칙은 이 문서에 없다. 있으면 그건 버그다.
   (근거: `docs/DECISIONS.md` D1, GDD 11장 7번 — 이 경계가 무너지면 `playtest` 에이전트가 성립하지 않는다)
2. **수치는 이 문서에 없다.** 전부 `src/config/balance.ts`의 상수 이름으로만 참조한다.
   이 문서에 숫자가 나오면 그건 맵 데이터(타일 좌표)이거나 근거 설명이다.
   예외: 부동소수 비교의 `1e-6` 같은 **밸런스가 아닌 수치 안정성 상수**는 코드에 직접 쓴다.
3. **RULES에 없는 규칙을 코드에 만들지 않는다.** 구현 중 규칙이 필요해지면 `gd`에게 돌려보낸다.
   조용히 만들면 `playtest`가 측정하는 대상과 `verify`가 대조하는 대상이 달라진다.
4. 이 문서의 모든 수치는 **playtest 미검증 가설**이다 (하네스 16). §9에 지어낸 값 목록이 있다.

## 스코프 선언

- 이 스펙은 GDD 10장 **MUST 10개 완주**를 전제로 쓰였다. 기능을 자르지 않는다.
- 대신 **가장 싼 규칙**을 골랐다. 비싼 선택을 피한 지점마다 그 이유를 적어 뒀다.
- **은신(수풀·온천)은 이번 스펙에서 설계하지 않는다** (GDD 10장 SHOULD).
  맵 데이터에 `B`(수풀)·`S`(온천) 타일은 **이미 배치돼 있고**, sim은 이를 **일반 바닥으로 취급**한다.
  MUST 완주 후 `HIDING.ENABLED`를 `true`로 바꾸는 것만으로 붙는다. 맵을 다시 그리지 않는다.

---

## §1. 맵 크기 확정 — 1600 × 1184 (50 × 37 타일)

**문제**: GDD 7장 세로 1200px ÷ 8장 타일 32px = 37.5 — 정수 타일이 아니다.

**결정**: 세로를 **1184px = 37타일**로 줄인다. (1216px = 38타일이 아니다)

**이유**:
- 맵을 키우면 미션 지점 간 이동 시간이 늘어난다. 제한시간 180초 · 미션 5개 · 소요 10/8/12초라
  **이동 시간이 시간 예산의 대부분**이다. 스코프가 꽉 찬 지금, 제한시간을 못 맞출 위험을 키우는
  방향은 고르지 않는다.
- 타일 32px는 GDD 8장 아트 규격이자 스프라이트 규격이다. 여기를 바꾸면 아트 전체가 흔들린다.
  **가장 싼 변경은 픽셀 하나가 아니라 문서 한 줄인 쪽**이다.
- 1200 → 1184는 16px 차이다. 카메라 추적 방식이라 화면 구성에 영향이 없다.

**반영**: GDD 7장 표 + `WORLD.MAP_HEIGHT_PX`.

**tech 필수 단언**: 맵 로드 시 아래 두 식이 참이 아니면 즉시 throw 한다.
`WORLD.MAP_WIDTH_PX / WORLD.TILE_SIZE_PX === 맵 열 수` , `WORLD.MAP_HEIGHT_PX / WORLD.TILE_SIZE_PX === 맵 행 수`
(원본이 둘로 나뉘어 있으므로, 어긋나면 조용히 틀리는 대신 시끄럽게 죽는 게 낫다)

---

## §2. 맵 레이아웃 (데이터)

> ### 🔄 2026-08-07 — **맵은 3개다.** 이 절의 원본은 `docs/SPEC_MAPS.md`로 옮겼다
>
> 사용자 승인으로 GDD 10장 WON'T의 "맵 2개 이상"이 해제됐다(`docs/DECISIONS.md` **D12**).
> **§2.4의 ASCII·§2.5의 앵커 좌표·§2.7의 순찰로는 이제 `MAPS[0]`(고블린 집터) **한 개에 대한 것**이고,
> 세 맵 전부의 원본은 **`docs/SPEC_MAPS.md` §3**이다. 둘이 어긋나면 `SPEC_MAPS.md`가 원본이다.
>
> **§2.2(문자 정의)·§2.3(구조 의도)·§2.6(순찰 격자)은 세 맵 전부에 그대로 적용된다.**
> 특히 **§2.6은 맵마다 다시 검사한다** — 새 맵에서 격자선이 벽에 막히면 고블린 AI와 봇 네비게이션이
> 동시에 무너진다. 기계 검사 조항은 `SPEC_MAPS.md` §4 **MC3**이다.

### §2.1 파일 위치

맵은 **밸런스 수치가 아니다** (playtest가 튜닝하는 축이 아니다). 따라서 `balance.ts`에 두지 않는다.
**맵이 3개가 된 뒤에도 그대로다** — 맵 선택은 무작위이고 맵별 수치 차이는 GDD 10장 WON'T다.

- **`src/sim/map.ts`** — `tech`가 만든다. Phaser를 import하지 않는다.
- 내보낼 것: `MAPS: readonly MapDef[]` (각 원소가 `rows` / `zone` / `goblinRoutes`를 갖는다),
  그리고 활성 맵을 1회 파싱해 만든 `isSolid(col, row)`, `MISSION_POINTS`, `GOBLIN_ROUTES`,
  `PLAYER_START`, `EXIT_POINT`.
- 파싱은 **맵당 1회**. 매 틱 문자열을 인덱싱하지 않는다 (성능이 아니라 실수 방지 목적).
- **맵 선택은 라운드 RNG의 첫 번째 소비다** (`SPEC_MAPS.md` §1.4). 순서가 흔들리면 같은 시드가
  다른 판을 만든다 — §2.5의 스캔 순서 고정과 같은 이유다.
- **`MAPS`의 길이가 1이어도 게임이 돌아야 한다.** 맵 개수로 분기하는 `if`를 만들지 않는다.

### §2.2 타일 문자 정의

| 문자 | 의미 | 통과 | 비고 |
|---|---|---|---|
| `#` | 벽 | ❌ | 유일한 solid 타일 |
| `.` | 바닥 | ✅ | |
| `B` | 수풀 | ✅ | **은신처.** 2026-08-07 `HIDING.ENABLED = true` → 고블린 감지에서 제외된다 (§4.3 5단계) |
| `S` | 온천 | ✅ | **은신처 + 시간 2배.** 2026-08-07 활성화 (§4.3 5단계, §6.2) |
| `M` | 미션 지점 | ✅ | 바닥 + 미션 앵커 |
| `E` | 탈출구 | ✅ | 바닥 + 탈출 앵커 |
| `P` | 플레이어 시작 | ✅ | 바닥 |
| `G` | 고블린 시작 | ✅ | 바닥. 3개 |

`isSolid`는 **`#`만 true**다. 맵 밖 좌표(col<0 등)도 true로 취급한다(테두리 밖으로 못 나가게).

타일 `(col, row)`의 중심 픽셀 = `(col * 32 + 16, row * 32 + 16)`.

### §2.3 구조 의도

50×37을 **4열 × 3행 = 12개 방**으로 나눈 실내 시설이다.

- 방 경계 벽: 세로 `col ∈ {12, 24, 36}` / 가로 `row ∈ {12, 24}`
- 출입구는 **2타일 폭**: 세로벽은 `row ∈ {6,7 / 18,19 / 30,31}`에서, 가로벽은 `col ∈ {6,7 / 18,19 / 30,31 / 42,43}`에서 뚫려 있다
  - 1타일(32px) 문은 히트박스 20px로 통과는 되지만 벽 슬라이딩과 겹쳐 조작감이 나쁘다. **2타일이 싸고 안전한 선택**이다
- 각 방 안에 짧은 벽 조각 4개(3칸 선분 2개 + 3칸 선분 1개 + 2칸 블록 1개)를 넣어 **차폐물**을 만들었다.
  전부 **볼록(convex) 형태**다 — 오목한 U/ㄷ자를 하나도 만들지 않았다. 이유는 §4.6(직선추격의 한계)이다
- 결과: 뻥 뚫린 시야가 없고, 방 하나를 가로지르는 동안 반드시 차폐물을 최소 1개 지난다

**의도적으로 비운 것**: 플레이어 시작 방(좌하단)에는 미션이 없고 고블린 순찰로도 지나가지 않는다.
시작 직후 3초 안에 죽는 판을 없애기 위한 **유예 구역**이다. 나머지 11개 방은 전부 순찰 또는 미션을 갖는다.

### §2.4 맵 원본 데이터 (50열 × 37행) — **`MAPS[0]` 고블린 집터**

> 모든 행은 정확히 **50자**다. 행 수는 정확히 **37**이다. tech는 로드 시 이를 단언한다.
> 좌상단이 `(col=0, row=0)`.
>
> **⚠️ 아래는 세 맵 중 하나(`MAPS[0]`)다.** `MAPS[1]`(숲)·`MAPS[2]`(동굴)의 ASCII와
> 세 맵 공통 불변식(MC1~MC13)은 **`docs/SPEC_MAPS.md` §3·§4**에 있다. 이 맵은 **한 글자도 바뀌지 않았다.**

```
##################################################
#...........#...........#...........#............#
#........BB.#...........#...........#............#
#.###....BB.#.###.......#.###.......#.###.....E..#
#.......#...#.......#...#.......#...#.......#....#
#....M..#...#.......#...#.....M.#...#.......#....#
#.......#...........#...........#...........#....#
#.........................................G......#
#..###......#..###......#..###......#..###.......#
#........##.#........##.#........##.#........##..#
#...........#...........#...........#............#
#...........#...........#...........#............#
######..##########..##########..##########..######
#...........#...........#...........#............#
#...........#...........#...........#............#
#.###.......#.###.......#.###.......#.###........#
#.......#...#.......#...#.......#...#.......#....#
#.......#SS.#.......#...#.......#...#.......#....#
#....M..#SS.........#.........M.#..........M#....#
#.....G..........................................#
#..###......#..###......#..###......#..###.......#
#........##.#........##.#........##.#........##..#
#...........#...........#..BB.......#.SS.........#
#...........#...........#..BB.......#.SS.........#
######..##########..##########..##########..######
#...........#...........#...........#............#
#...........#...........#...........#............#
#.###.......#.###.......#.###.......#.###........#
#.......#...#.......#...#.......#...#.......#....#
#.......#...#.......#...#.......#...#.......#....#
#....P..#.........M.#...........#..........M#....#
#.........................................G......#
#..###......#..###......#..###......#..###.......#
#........##.#........##.#........##.#........##..#
#...........#.BB........#...........#............#
#...........#.BB........#...........#............#
##################################################
```

### §2.5 앵커 좌표 (위 맵에서 파싱되는 값 — 대조용)

| 대상 | 타일 (col,row) | 픽셀 중심 (x,y) |
|---|---|---|
| 플레이어 시작 `P` | (5, 30) | (176, 976) |
| 탈출구 `E` | (46, 3) | (1488, 112) |
| 미션 지점 0 | (5, 5) | (176, 176) |
| 미션 지점 1 | (30, 5) | (976, 176) |
| 미션 지점 2 | (5, 18) | (176, 592) |
| 미션 지점 3 | (30, 18) | (976, 592) |
| 미션 지점 4 | (43, 18) | (1392, 592) |
| 미션 지점 5 | (18, 30) | (592, 976) |
| 미션 지점 6 | (43, 30) | (1392, 976) |
| 고블린 0 시작 `G` | (6, 19) | (208, 624) |
| 고블린 1 시작 `G` | (42, 7) | (1360, 240) |
| 고블린 2 시작 `G` | (42, 31) | (1360, 1008) |

**인덱스는 전부 "맵 스캔 순서"로 고정한다: `row` 오름차순 → 같은 row 안에서 `col` 오름차순.**
(§5.6의 시드 재현성이 이 순서에 의존한다. 인덱스가 흔들리면 같은 시드가 다른 판을 만든다.)

미션 지점은 스캔 순서가 위 표 순서와 그대로 일치한다:
`0=(5,5) 1=(30,5) 2=(5,18) 3=(30,18) 4=(43,18) 5=(18,30) 6=(43,30)`.

고블린은 위 표(읽기 편하게 정렬한 것)와 스캔 순서가 다르다. **구현이 따르는 것은 아래다**:

| 인덱스 | 시작 타일 | 담당 순찰로 |
|---|---|---|
| goblin[0] | (42, 7) | `ROUTE_EAST` |
| goblin[1] | (6, 19) | `ROUTE_NORTHWEST` |
| goblin[2] | (42, 31) | `ROUTE_SOUTH` |

순찰로는 `G` 문자로부터 자동 추론할 수 없다. `src/sim/map.ts`에 **인덱스 순서대로 상수 배열**로 적고,
`GOBLIN_ROUTES[i][0]`이 스캔으로 찾은 i번째 `G` 좌표와 같은지 로드 시 단언한다.

미션 지점 사이 최소 거리는 12타일(384px)이다. 기본 속도 90px/s로 직선 4.3초 — 벽을 우회하면 더 걸린다.
**어떤 두 미션도 "서서 둘 다 처리"할 수 없다**는 것이 이 배치의 유일한 요구사항이었고, 충족한다.

### §2.6 순찰 격자 (waypoint lattice) — 이 스펙에서 가장 중요한 데이터

맵 위에 **12개 노드의 4×3 격자**를 정의한다. 노드 = `col ∈ {6, 18, 30, 42}` × `row ∈ {7, 19, 31}`.

**이 격자는 세 맵 전부에서 동일하다.** 격자 좌표는 맵마다 다르지 않다 — 다르게 만들면 순찰로·봇
네비게이션·소품 회피 규칙(`SPEC_ZONES.md` §4.1)을 맵마다 3벌 유지해야 한다.

이 격자는 다음 성질을 **맵 데이터 수준에서 보장**한다 (gd가 세 맵 전부 수동 검증했다):

- **`col 6 / 18 / 30 / 42`는 row 1~35 전 구간에 벽이 없다.**
- **`row 7 / 19 / 31`은 col 1~48 전 구간에 벽이 없다.**
- 따라서 격자의 **모든 4-이웃 간선은 벽 없는 직선**이다. 길찾기 없이 이동할 수 있다.
- 히트박스가 20px이므로, 타일 중심선을 따라 움직이는 몸은 그 타일 열/행 **하나만** 점유한다
  (`6*32+16 ± 10 = [198, 218]` → 둘 다 col 6). 따라서 벽에 스치지도 않는다.

> **이 성질이 깨지면 봇 네비게이션(§7.3)과 고블린 순찰(§4.4)이 동시에 무너진다.**
> 맵을 수정하거나 **추가하면** 반드시 이 4개 열 + 3개 행에 `#`이 들어가지 않았는지 재검사한다.
> `verify`가 기계적으로 검사할 수 있는 조항이다 (맵당 문자열 인덱싱 21회 → **3맵이면 63회**).
>
> **2026-08-07: 이건 이제 수동 재검사가 아니라 로드 시 단언이다** — `SPEC_MAPS.md` §4 **MC3**.
> `gd`가 새 맵 2개를 열/행 단위로 손검산했지만 **실행 검증이 아니므로**(하네스 14) 코드가 다시 잡는다.

노드 번호: `nodeId = colIndex + 4 * rowIndex` (colIndex: 6→0, 18→1, 30→2, 42→3 / rowIndex: 7→0, 19→1, 31→2)

### §2.7 고블린 순찰로 — 아래 표는 **`MAPS[0]`**. 세 맵 전부는 `SPEC_MAPS.md` §3

각 순찰로는 **위 격자 노드만으로 이루어진 닫힌 루프**다. 따라서 순찰 중에는 절대 벽에 막히지 않는다.
**이 성질은 세 맵 전부에 요구된다** (`SPEC_MAPS.md` §4 **MC7**).

> **세 맵의 순찰로 총 길이는 전부 168타일(48 + 48 + 72)로 맞췄다.** 우연이 아니라 파리티 장치다 —
> 순찰 압력이 맵마다 다르면 그게 곧 맵별 난이도 차이가 된다. `SPEC_MAPS.md` §1.3.

| 순찰로 | 웨이포인트 (타일 좌표, 이 순서로 순환) | 커버 |
|---|---|---|
| `ROUTE_EAST` (goblin[0]) | (42,7) → (42,19) → (30,19) → (30,7) → 반복 | 우상단 4개 방 + 탈출구 접근로 |
| `ROUTE_NORTHWEST` (goblin[1]) | (6,19) → (6,7) → (18,7) → (18,19) → 반복 | 좌상단 4개 방 |
| `ROUTE_SOUTH` (goblin[2]) | (42,31) → (18,31) → (18,19) → (42,19) → 반복 | 하단 + 중앙 오른쪽 |

각 고블린은 자기 순찰로의 **인덱스 0에서 시작**하고, 첫 목표는 인덱스 1이다.
초기 facing = `normalize(waypoint[1] - waypoint[0])`.

**미션 지점 7곳 전부가 어떤 순찰로에서 2타일 이내**에 있다. 즉 "아무도 안 오는 안전한 미션"은 없다.
**이건 `MAPS[0]`의 사실이 아니라 세 맵 전부에 거는 요구다** → 기계 검사 `SPEC_MAPS.md` §4 **MC8**.
(5,5)↔(6,7) / (30,5)↔(30,7) / (5,18)↔(6,19) / (30,18)↔(30,19) / (43,18)↔(42,19) /
(18,30)↔(18,31) / (43,30)↔(42,31).

> 이건 **의도적으로 어렵게 잡은 초기값**이다. 클리어율이 35% 아래로 나오면 `playtest`의 조정 대상은
> 이 순찰로가 아니다. **순찰로는 맵 데이터이므로 밸런스 축이 아니다** — 바꾸려면 이 문서를 고쳐야 한다.
>
> **조정 순서 정정 (2026-08-07, 라운드 1 측정 후)**: 이 문단은 원래 `GOBLIN.VISION_RADIUS_PX`를
> 1순위로 지목했다. 그 지목은 **"고블린은 플레이어보다 느리므로 일단 걸려도 도망칠 수 있다"**는
> 전제 위에 있었는데, `CHASE_SPEED`가 실제로는 95(플레이어 90보다 빠름)여서 **전제가 거짓이었다.**
> 전제가 거짓인 순위는 승계하지 않는다 → 라운드 2의 축은 `GOBLIN.CHASE_SPEED_PX_PER_SEC`(95 → 75)다.
> `VISION_RADIUS_PX`는 그 다음(라운드 3) 후보로 유지된다. 근거와 전체 라운드 계획은 `docs/DECISIONS.md` D7.
>
> 이 문단은 "만나는 빈도"를, 속도는 "만난 뒤 빠져나올 수 있는가"를 다룬다. **후자가 먼저다** —
> 빠져나올 수 없으면 빈도를 줄여도 만나는 순간 결과가 같다.

---

## §3. 이동 · 충돌 모델

### §3.1 입력

`SimInput`(기존 타입 그대로): `moveX ∈ [-1,1]`, `moveY ∈ [-1,1]`, `interact: boolean`, `dash: boolean`.

**8방향 입력을 채택한다.** 4방향이 아니다.

- 이유: **고블린과 봇은 어차피 임의 각도의 벡터로 움직인다**(직선 추격·회피). 즉 sim에는 실수 벡터
  이동 함수가 반드시 있어야 한다. 플레이어만 4방향으로 제한하는 것은 **코드를 아끼는 게 아니라
  제약 코드를 더 쓰는 것**이다. 8방향이 실제로 더 싸다.
- 스프라이트는 GDD 4장대로 4방향이다. **facing(그릴 방향)만 4방향으로 양자화**한다:
  `|dx| >= |dy|` 이면 `dx > 0 ? right : left`, 아니면 `dy > 0 ? down : up`. 이동 벡터 자체는 건드리지 않는다.
  이건 렌더 관심사이므로 sim은 facing을 상태로 보관만 하고 판정에 쓰지 않는다(플레이어 한정. 고블린은 §4.2).

### §3.2 속도 벡터

```
len = sqrt(moveX^2 + moveY^2)
if len < 1e-6:  vx = vy = 0
else:           vx = (moveX/len) * speed,  vy = (moveY/len) * speed
```

**정규화하므로 대각선 속도 보정은 따로 하지 않는다.** 정규화가 곧 보정이다.
`speed` = 대시 중이면 `PLAYER.DASH_SPEED_PX_PER_SEC`, 아니면 `PLAYER.BASE_SPEED_PX_PER_SEC`.

### §3.3 충돌 — AABB vs 타일 그리드, 축별 분리 해결

원 vs 타일이 아니라 **AABB vs 타일**이다. 이유: 타일 그리드가 AABB이므로 겹침 계산이 `floor` 4번이면 끝난다.
원-AABB는 코너 케이스(모서리 최근접점)를 따로 써야 해서 더 비싸고, 32px 타일에서 체감 차이가 없다.

히트박스: 위치 `(x, y)`를 **중심**으로 한 `PLAYER.HITBOX_W_PX × PLAYER.HITBOX_H_PX` (20×20).
고블린도 `GOBLIN.HITBOX_W_PX × GOBLIN.HITBOX_H_PX` (20×20).
스프라이트 32px보다 작게 잡은 이유: 2타일 문(64px)과 벽 사이 통로를 여유 있게 통과시키기 위함.
**작은 히트박스는 "끼임" 버그를 원천적으로 줄인다** — 4일 프로젝트에서 이건 재미보다 중요하다.

겹치는 타일 범위 (`hw = W/2`, `hh = H/2`, `EPS = NAV.COLLISION_EPSILON_PX`, `T = WORLD.TILE_SIZE_PX`):

```
c0 = floor((x - hw)       / T)
c1 = floor((x + hw - EPS) / T)
r0 = floor((y - hh)       / T)
r1 = floor((y + hh - EPS) / T)
```

**축별 분리 해결(슬라이딩)을 한다.** 하지 않으면 벽에 닿는 순간 완전히 멈춰 조작감이 무너진다.
한 틱의 이동은 **X 먼저, Y 나중** 두 단계다 (순서를 고정한다. 뒤집으면 코너에서 결과가 달라진다):

```
moveAxisX(dx):
  x += dx
  if dx == 0: return
  (c0,c1,r0,r1) = 위 식으로 계산
  for r in r0..r1: for c in c0..c1:
    if isSolid(c, r):
      if dx > 0: x = c * T - hw - EPS        # 오른쪽 이동 → 그 타일 왼쪽 면에 붙인다
      else:      x = (c + 1) * T + hw + EPS  # 왼쪽 이동 → 그 타일 오른쪽 면에 붙인다
      return                                  # 첫 충돌에서 종료 (붙인 뒤엔 더 겹칠 수 없다)

moveAxisY(dy):  # 위와 동일, y / hh / r 로 치환
```

`dx > 0`일 때 `c0..c1`을 **오름차순**으로, `dx < 0`일 때 **내림차순**으로 순회한다
(진행 방향에서 가장 먼저 만나는 벽에 붙이기 위함). Y도 같다.

### §3.4 대시

- `input.dash == true` && `dashCooldownTimer <= 0` && `dashTimer <= 0` && 미션 중이 아님
  → `dashTimer = PLAYER.DASH_DURATION_SEC`, `dashCooldownTimer = PLAYER.DASH_COOLDOWN_SEC`
- `dashTimer > 0`인 동안 speed = `DASH_SPEED`. 대시는 **방향을 고정하지 않는다**(발동 중에도 방향 전환 가능).
  방향 고정은 규칙을 하나 더 만드는 것이고, 이 게임의 긴장은 "미션 중 못 움직임" 하나여야 한다(GDD 2장).
- 두 타이머는 매 틱 `dt`만큼 감소한다. 쿨다운은 **발동 시점부터** 돈다(지속 종료 시점이 아니다).
  → 실효 재사용 간격은 3초다(0.4초 지속이 그 안에 포함).

### §3.5 이 모델이 안 하는 것 (명시적 제외)

- 관성·가속도·마찰 — 즉시 최고속도. 튜닝 축을 늘리지 않는다
- 유닛 간 충돌 (플레이어↔고블린, 고블린↔고블린) — **서로 통과한다.**
  접촉은 §4.7 거리 판정으로만 다룬다. 유닛 간 밀어내기는 3체 이상에서 진동·끼임을 만들고,
  그걸 잡는 데 드는 시간이 이틀 예산에서 가장 위험한 지출이다
- 이동 중 스윕(swept) 충돌 — 최대 이동량이 `150 * (1/60) = 2.5px`로 타일 32px보다 훨씬 작아
  터널링이 발생하지 않는다. 계산으로 배제된다(실측 아님)

---

## §4. 고블린 FSM

GDD 6장의 4상태를 그대로 쓴다. 상태를 늘리지 않는다.

### §4.1 고블린 상태 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `pos` | `Vec2` | 중심 좌표 (px) |
| `state` | `'PATROL' \| 'CHASE' \| 'SEARCH' \| 'ATTACK'` | |
| `facing` | `Vec2` | **단위 벡터.** 시야 판정의 기준축 |
| `wpIndex` | `number` | 순찰로 인덱스 |
| `lastSeenPos` | `Vec2` | 마지막으로 플레이어를 본 좌표 |
| `loseSightSec` | `number` | CHASE 중 못 본 누적 시간 |
| `searchSec` | `number` | SEARCH 경과 시간 |
| `attackSec` | `number` | ATTACK 잔여 시간 |
| `avoidDir` | `Vec2` | 우회 커밋 방향 (단위 벡터) |
| `avoidSec` | `number` | 우회 커밋 잔여 시간 |
| `stuckSec` | `number` | CHASE 중 전진 실패 누적 시간 |

### §4.2 "진행 방향"(facing)의 정의 — 애매함 제거

`facing`은 **직전 틱의 실제 변위**로 정의한다. 의도 방향이 아니라 **충돌 해결 후 실제로 움직인 양**이다.
(벽에 막혀 못 간 방향을 계속 쳐다보면 벽을 노려보는 고블린이 된다.)

```
adv = pos_after - pos_before                     # 이 틱의 실제 변위
if |adv| >= 1e-6:  facing = adv / |adv|
else:              facing 유지                    # 정지 시에는 마지막 값을 그대로 쓴다
```

**예외 — SEARCH 정지 중에는 facing이 회전한다** (§4.5). 이때만 변위 없이 facing이 바뀐다.
**ATTACK 중에는 회전하지 않는다.** 초기값은 §2.7.

`facing`은 **정규화 상태를 항상 유지**해야 한다. 시야 판정이 `dot`을 쓰므로, 길이가 1이 아니면 각도가 틀린다.

### §4.3 시야 판정 `canSee(g, playerPos)` — 5단계, 순서 고정

싼 것부터 판정해 비싼 레이캐스트를 최대한 건너뛴다.

```
1. d  = playerPos - g.pos
   d2 = d.x*d.x + d.y*d.y
   if d2 > GOBLIN.VISION_RADIUS_PX^2 : return false      # 제곱 비교. sqrt 안 쓴다
2. if d2 < 1e-12 : return true                            # 완전히 겹침
3. dist = sqrt(d2);  u = d / dist
   if dot(g.facing, u) < cos(GOBLIN.VISION_ANGLE_DEG / 2 * PI / 180) : return false
4. if GOBLIN.VISION_BLOCKED_BY_WALLS && rayHitsWall(g.pos, playerPos) : return false
5. if HIDING.ENABLED && 플레이어 중심 타일이 'B'|'S' : return false     # MUST 스코프에선 항상 skip
   return true
```

3단계의 `cos(...)`는 **매 틱 계산하지 않는다.** `VISION_ANGLE_DEG`는 상수이므로 모듈 로드 시 1회
`VISION_COS_LIMIT`로 미리 구해 둔다. (`balance.ts`에는 파생식을 못 넣으므로 `src/sim/` 쪽에서 만든다.
이건 밸런스 수치가 아니라 `VISION_ANGLE_DEG`의 캐시이므로 하네스 위반이 아니다.)

**시야각 90°는 반각 45°다.** `cos(45°) ≈ 0.7071`. 부호를 뒤집거나 반각을 빼먹는 실수가 잦은 지점이다.

### §4.4 레이캐스트 `rayHitsWall(a, b)` — DDA (Amanatides–Woo)

선분이 지나는 **타일만** 검사한다. 픽셀 단위 샘플링을 하지 않는다(샘플 간격을 잘못 잡으면
얇은 벽을 뚫고, 촘촘히 잡으면 3마리 × 60틱 × 벽검사가 낭비된다).

```
T  = WORLD.TILE_SIZE_PX
cx = floor(a.x / T);  cy = floor(a.y / T)
ex = floor(b.x / T);  ey = floor(b.y / T)
dx = b.x - a.x;  dy = b.y - a.y

stepX = sign(dx);  stepY = sign(dy)                       # -1 / 0 / +1

if dx != 0:
  tDeltaX = |T / dx|
  nextBoundaryX = (stepX > 0) ? (cx + 1) * T : cx * T
  tMaxX = (nextBoundaryX - a.x) / dx
else:
  tDeltaX = +Infinity;  tMaxX = +Infinity
(y도 동일)

while true:
  if isSolid(cx, cy): return true
  if cx == ex && cy == ey: return false
  if tMaxX < tMaxY:
    if tMaxX > 1: return false                            # 선분 끝을 지나쳤다
    cx += stepX;  tMaxX += tDeltaX
  else:
    if tMaxY > 1: return false
    cy += stepY;  tMaxY += tDeltaY
```

- `t`는 선분을 `[0,1]`로 정규화한 파라미터다. `t > 1` 컷이 무한 루프를 막는 안전장치다
- **시작 타일도 검사한다.** 고블린이 벽 안에 있으면 아무것도 못 보는 게 맞다(그런 상태 자체가 버그 신호)
- 정확히 타일 모서리를 지나는 경우 `tMaxX == tMaxY`가 되고 위 코드는 Y를 먼저 밟는다.
  **`else`가 Y 쪽인 것이 규칙이다.** 뒤집으면 코너 너머가 보이고 안 보이고가 달라진다
- 이 함수는 §7.2(봇의 위험 인지)와 §7.3(봇 네비게이션)도 그대로 쓴다. **sim에서 단 하나만 존재한다**

### §4.5 상태 전이 — 각 상태에서 매 틱 실행할 것

**틱 내 고블린 처리 순서: 인덱스 0 → 1 → 2.** (동시 처리가 아니다. 순서를 고정해야 재현된다.)
각 고블린에 대해 아래를 **위에서 아래로** 실행한다.

#### PATROL

```
1. if canSee(g, player.pos):
     g.state = 'CHASE';  g.lastSeenPos = player.pos;  g.loseSightSec = 0;  g.stuckSec = 0
     → CHASE 블록으로 넘어가지 않는다. 이 틱은 여기서 이동만 CHASE 규칙으로 한다
2. target = route[g.wpIndex]
   if |target - g.pos| <= NAV.WAYPOINT_ARRIVE_RADIUS_PX:
     g.wpIndex = (g.wpIndex + 1) % route.length;  target = route[g.wpIndex]
3. steer(g, target, GOBLIN.PATROL_SPEED_PX_PER_SEC)      # §4.6
```

#### CHASE

```
1. if |player.pos - g.pos| <= GOBLIN.CONTACT_RADIUS_PX:
     → ATTACK 진입 (§4.7). 이 틱의 이동은 하지 않는다. 종료
2. if canSee(g, player.pos):
     g.lastSeenPos = player.pos;  g.loseSightSec = 0
   else:
     g.loseSightSec += dt
     if g.loseSightSec >= GOBLIN.LOSE_SIGHT_TO_SEARCH_SEC:
       g.state = 'SEARCH';  g.searchSec = 0;  g.stuckSec = 0;  종료
3. steer(g, g.lastSeenPos, GOBLIN.CHASE_SPEED_PX_PER_SEC)
4. if 이번 틱 실제 전진 |adv| < NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK:  g.stuckSec += dt
   else:                                                              g.stuckSec = 0
   if g.stuckSec >= GOBLIN.CHASE_STUCK_ABORT_SEC:
     g.state = 'SEARCH';  g.searchSec = 0;  g.stuckSec = 0
```

2번의 `loseSightSec` 누적이 GDD 11장 3번("벽 뒤로 숨으면 3초 뒤 추격이 풀린다")의 구현이다.
**연속 3초가 아니라 누적 3초**가 아니다 — 다시 보이면 `0`으로 **리셋**되므로 연속 3초다. 이게 맞다.

#### SEARCH

```
1. if canSee(g, player.pos):
     g.state = 'CHASE';  g.lastSeenPos = player.pos;  g.loseSightSec = 0;  g.stuckSec = 0;  종료
2. g.searchSec += dt
   if g.searchSec >= GOBLIN.SEARCH_DURATION_SEC:
     g.state = 'PATROL'
     g.wpIndex = 자기 순찰로에서 g.pos에 가장 가까운 노드의 인덱스   # 직선거리. 동률이면 작은 인덱스
     종료
3. if |g.lastSeenPos - g.pos| > GOBLIN.SEARCH_ARRIVE_RADIUS_PX:
     steer(g, g.lastSeenPos, GOBLIN.PATROL_SPEED_PX_PER_SEC)     # 도착 전: 걸어간다
   else:
     이동하지 않는다. facing을 GOBLIN.SEARCH_TURN_DEG_PER_SEC * dt 만큼 **시계방향** 회전:
       a = SEARCH_TURN_DEG_PER_SEC * dt * PI / 180
       facing = ( facing.x*cos(a) - facing.y*sin(a),  facing.x*sin(a) + facing.y*cos(a) )
     (회전 후 재정규화한다 — 부동소수 누적으로 길이가 1에서 벗어난다)
```

**SEARCH에서 제자리 회전을 넣은 이유**: 가만히 서서 한 방향만 보는 고블린은 벽 뒤에 숨은 플레이어를
영원히 못 찾는다. 그러면 SEARCH가 "5초짜리 무적 시간"이 되어 게임이 쉬워진다.
회전은 코드 3줄이고, 90°/s면 5초에 1.25바퀴 → **최소 한 바퀴는 돈다.**

2번의 "가장 가까운 노드로 복귀"가 CHASE로 끌려간 고블린을 순찰로에 되돌려 놓는 장치다.
이게 없으면 3마리가 전부 한 구석에 모여 맵의 절반이 무방비가 된다.

#### ATTACK

```
진입 시(1회):  §4.7의 피격 처리를 실행하고  g.attackSec = GOBLIN.ATTACK_COOLDOWN_SEC
매 틱:
  1. g.attackSec -= dt
  2. 이동하지 않는다. facing도 회전하지 않는다
  3. if g.attackSec <= 0:
       g.state = 'CHASE'
       g.loseSightSec = 0;  g.stuckSec = 0
       if canSee(g, player.pos):  g.lastSeenPos = player.pos
       # 안 보이면 lastSeenPos를 유지한다 → 넉백으로 사라진 플레이어를 그 자리로 쫓아간다
```

**ATTACK 중 고블린이 완전히 멈추는 것이 이 규칙의 핵심이다.**
피격당한 플레이어에게 `ATTACK_COOLDOWN_SEC`(1초)의 도주 여유를 주기 위한 설계다.
무적 1.5초 > 쿨다운 1초이므로, 도망치지 못해도 최소 1회는 연속 피격되지 않는다.

### §4.6 `steer(g, target, speed)` — 직선 이동 + 슬라이딩 + 우회 커밋

**A\*를 쓰지 않는다.** 이틀 안에 구현·튜닝·디버깅까지 끝낼 자신이 없고, 실패했을 때
대체할 시간이 없다. 대신 아래 3단 방어로 "벽에 영원히 낀다"는 최악의 실패 모드만 잘라낸다.

```
steer(g, target, speed):
  before = g.pos
  desired = normalize(target - g.pos)        # |target - pos| < 1e-6 이면 이동 없음, 종료

  if g.avoidSec > 0:
    dir = g.avoidDir;  g.avoidSec -= dt      # 1단: 커밋 중이면 우회 방향 유지
  else:
    dir = desired

  moveAxisX(g, dir.x * speed * dt)           # 2단: §3.3 축별 분리 해결 = 벽 슬라이딩
  moveAxisY(g, dir.y * speed * dt)

  adv = g.pos - before
  if |adv| >= 1e-6:  g.facing = adv / |adv|

  if |adv| < NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK && g.avoidSec <= 0:
    # 3단: 슬라이딩으로도 못 갔다 = 벽에 정면으로 박았다 → 수직 방향 하나를 골라 커밋
    perpA = (-desired.y,  desired.x)         # 좌회전 90°
    perpB = ( desired.y, -desired.x)         # 우회전 90°
    freeA = !isSolidAtPixel(g.pos + perpA * NAV.AVOID_PROBE_PX)
    freeB = !isSolidAtPixel(g.pos + perpB * NAV.AVOID_PROBE_PX)
    if      freeA && !freeB:  chosen = perpA
    else if freeB && !freeA:  chosen = perpB
    else if freeA && freeB:   chosen = (dot(perpA, g.facing) >= dot(perpB, g.facing)) ? perpA : perpB
    else:                     chosen = perpA          # 둘 다 막힘 → 결정적으로 perpA
    g.avoidDir = chosen;  g.avoidSec = NAV.AVOID_COMMIT_SEC
```

`isSolidAtPixel(p)` = `isSolid(floor(p.x / T), floor(p.y / T))`.

**왜 커밋(0.5초 유지)이 필요한가**: 매 틱 다시 고르면, 벽에 박은 고블린이 좌우로 진동하며 제자리에 선다
(전진 실패 → 좌로 조금 → 다시 정면 → 실패 → 우로 조금 → ...). 이건 **관찰하기 전에는 알아채기 힘든
실패 모드**라 규칙 수준에서 미리 막는다.

**4단 방어**: 그래도 못 빠져나오면 CHASE의 `stuckSec`가 `CHASE_STUCK_ABORT_SEC`(1.5초)에 도달해
SEARCH로 전이하고, SEARCH가 끝나면 PATROL이 **가장 가까운 순찰 노드**로 데려간다.
순찰 노드 간 간선은 §2.6에서 벽이 없음이 보장되므로, **PATROL에 복귀한 고블린은 절대 끼지 않는다.**
→ 즉 끼임은 최대 `1.5 + 5 = 6.5초` 안에 반드시 자가 복구된다. 영구 고착이 구조적으로 불가능하다.

**맵 설계와의 연동**: §2.3에서 방 안 차폐물을 전부 볼록 형태로만 만든 것이 이 알고리즘의 전제다.
오목한 ㄷ자를 넣으면 우회 커밋이 안쪽에서 튕겨 나오지 못한다. **맵을 고칠 때 이 제약을 깨지 마라.**

### §4.7 접촉 판정과 피격

접촉은 **히트박스 겹침이 아니라 중심 간 거리**로 본다 (`GOBLIN.CONTACT_RADIUS_PX = 24px`).
AABB 겹침 판정보다 싸고, 20×20 히트박스 두 개가 겹치는 거리(≈20~28px)와 실질적으로 같다.

```
if (player.pos - g.pos) 의 제곱거리 <= GOBLIN.CONTACT_RADIUS_PX^2  →  ATTACK 진입
```

피격 처리(= ATTACK 진입 시 1회 실행)의 **정확한 순서**는 §6.3에 있다. 여기서 중복 정의하지 않는다.

---

## §5. 미션 진행

### §5.1 sim은 미니게임을 재현하지 않는다

M1(배선)·M2(온도)·M3(기억)의 **조작 내용은 sim에 존재하지 않는다.**
sim에서 미션은 **"정해진 초를 소비하는 행위"** 하나로 추상화된다.

- 근거: 미니게임의 조작 난이도까지 시뮬하려면 봇에게 3종류의 미니게임 AI를 따로 써야 한다.
  그건 이틀 예산 밖이고, **밸런스 축을 3개 늘리는 것**이라 GDD 7장의 목표 지표 추적도 불가능해진다
- 대신 **난이도 차이는 소요 시간 차이로만 표현**한다: M1=10초 / M2=8초 / M3=12초
- 렌더 쪽(`GameScene`)의 미니게임 UI는 이 타이머를 **시각화**할 뿐, 완료 시점을 스스로 판정하지 않는다.
  판정은 sim이 한다 (하네스 아키텍처 3)

> ⚠️ **이것은 실제 플레이와 시뮬 사이의 알려진 괴리다.** 사람은 M3에서 실수해 12초보다 오래 걸릴 수 있다.
> `playtest`의 클리어율은 "미니게임을 항상 정확히 규정 시간에 끝내는 플레이어" 기준이므로,
> **실제 사람의 클리어율은 시뮬보다 낮게 나온다.** 이 사실을 「AI 활용 기술 문서」에 그대로 적는다 (하네스 14).

### §5.2 미션 지점 상태

| 필드 | 설명 |
|---|---|
| `index` | 0~6 (§2.5 스캔 순서) |
| `pos` | 픽셀 중심 |
| `type` | `'M1' \| 'M2' \| 'M3'` — **맵이 아니라 인덱스로 고정** (§5.5) |
| `active` | 이번 판에 뽑혔는가 (§5.6) |
| `done` | 완료됐는가 |

진행도는 **미션 지점이 아니라 플레이어가 들고 있다**: `player.missionIndex: number | null`, `player.missionSec: number`.
이유는 §5.4.

### §5.3 시작 조건 — 매 틱, 이 순서로

```
if player.missionIndex != null:  → §5.4 (진행 중)로
if !input.interact:              → 아무 일도 없음
후보 = { p | p.active && !p.done && 제곱거리(player.pos, p.pos) <= MISSION.INTERACT_RADIUS_PX^2 }
if 후보 비어있음:                 → 아무 일도 없음
선택 = 후보 중 제곱거리 최소.  동률이면 index가 작은 쪽
player.missionIndex = 선택.index
player.missionSec   = 0
```

**대시 중에도 시작할 수 있다.** 대시는 시작과 동시에 이동이 멈추므로 자연히 끊긴다(`dashTimer`는 계속 돈다).
"대시 중 미션 금지" 같은 규칙을 추가하지 않는다 — 판정만 늘고 재미에 기여하지 않는다.

### §5.4 진행 중

```
1. 이동 입력 무시. player 속도 = 0        (MISSION.PLAYER_CAN_MOVE_DURING == false)
2. 자발적 중단 판정:
   if |input.moveX| > 1e-6 || |input.moveY| > 1e-6:
     if MISSION.CANCEL_RESETS_PROGRESS:  player.missionSec = 0
     player.missionIndex = null
     이 틱은 여기서 종료 (이동은 다음 틱부터)
3. player.missionSec += dt                # 실시간 dt. 온천 시간 배속의 영향을 받지 않는다
4. if player.missionSec >= durationOf(type):
     point.done = true
     completedCount += 1
     player.missionIndex = null
     player.missionSec = 0
```

`durationOf` = M1 → `MISSION.M1_WIRING_DURATION_SEC` / M2 → `M2_TEMPERATURE_DURATION_SEC` / M3 → `M3_MEMORY_DURATION_SEC`.

**진행도를 플레이어가 들고 있는 이유**: `CANCEL_RESETS_PROGRESS`가 `true`면 진행도는 어차피
"현재 수행 중인 하나"밖에 없다. 지점마다 진행도를 두면 존재하지 않는 상태를 7개 관리하게 된다.
`false`로 바꾸고 싶어지면 그때 지점 쪽으로 옮긴다(그 경우 `gd`가 이 문서를 먼저 고친다).

**3번이 `dt`이지 `dt * timeScale`이 아닌 것에 주의.** 온천에서 시간이 2배로 흘러도 미션은 2배 빨리
끝나지 않는다. 그러면 온천이 페널티가 아니라 보상이 되어 시그니처 규칙이 뒤집힌다.

### §5.5 미션 타입 배정 (고정)

| 지점 index | 타일 | 타입 | 소요 |
|---|---|---|---|
| 0 | (5, 5) | M1 | 10초 |
| 1 | (30, 5) | M2 | 8초 |
| 2 | (5, 18) | M3 | 12초 |
| 3 | (30, 18) | M1 | 10초 |
| 4 | (43, 18) | M2 | 8초 |
| 5 | (18, 30) | M3 | 12초 |
| 6 | (43, 30) | M1 | 10초 |

M1×3, M2×2, M3×2. 타입은 **판마다 섞지 않는다** — 섞으면 §5.6의 "각 타입 최소 1개"가
지점 배치와 무관해져 시드 재현이 어려워지고, 얻는 것이 없다.

`src/sim/map.ts`에 `MISSION_TYPES = ['M1','M2','M3','M1','M2','M3','M1']` 상수로 둔다.

### §5.6 활성 5곳 선정 — 시드 고정 절차

`rng`는 `src/sim/rng.ts`의 `createRng(seed)`다. **`Math.random()`을 쓰지 않는다.**
아래 절차는 **정확히 이 호출 순서**여야 한다. 순서가 바뀌면 같은 시드가 다른 판을 만든다.

```
selected = []            # 순서 있는 배열

# 1단계 — 각 타입 최소 1개 보장 (MISSION.MIN_PER_TYPE == 1)
for T in ['M1', 'M2', 'M3']:                       # 이 순서 고정
  L = MISSION_TYPES에서 타입이 T인 index들, 오름차순
  selected.push( L[ rng.nextInt(L.length) ] )
# → 여기서 rng를 정확히 3회 호출한다. selected.length == 3

# 2단계 — 나머지를 부분 Fisher-Yates로 채운다
remaining = (0..6) 중 selected에 없는 index, 오름차순      # length == 4
need = MISSION.ACTIVE_COUNT - selected.length              # == 2
for i in 0 .. need-1:
  j = i + rng.nextInt(remaining.length - i)
  swap(remaining[i], remaining[j])
  selected.push(remaining[i])
# → rng를 정확히 need회(2회) 더 호출한다

# 3단계
selected.sort(오름차순)
각 index에 대해 point.active = true
```

- 총 rng 호출 = **5회**, 항상 같다. (호출 횟수가 판마다 달라지면 이후 난수 소비가 어긋난다)
- 1단계가 `MIN_PER_TYPE`을 구조적으로 보장한다. 사후 검사·재추첨(rejection sampling)을 쓰지 않는다
  — 재추첨은 rng 호출 횟수가 가변이라 재현성 디버깅이 지옥이 된다
- `MIN_PER_TYPE`이 2 이상이 되면 이 절차는 성립하지 않는다(M2·M3가 2개뿐). 지금 값 1에서만 유효하다.
  바꾸려면 이 문서를 먼저 고친다

**tech 필수 단언**: 선정 결과가 5개이고, M1·M2·M3가 각각 1개 이상 포함되는지 라운드 시작 시 검사한다.

---

## §6. 승패 판정

### §6.1 한 틱의 실행 순서 — 고정

이 순서가 곧 게임 규칙이다. 바꾸면 같은 시드가 다른 결과를 낸다.

```
dt = SIM.TIMESTEP_SEC

1. 타이머 감소
   player.invulnSec       -= dt   (0 미만이면 0)
   player.dashSec         -= dt
   player.dashCooldownSec -= dt
   각 고블린: attackSec -= dt 는 §4.5 ATTACK 블록에서만 처리 (여기서 안 한다)
2. 입력 결정        — 봇(§7) 또는 사람 입력을 SimInput으로 받는다
3. 미션 로직        — §5.3 / §5.4
4. 플레이어 이동    — 미션 중이면 건너뛴다. §3.2 → §3.3
5. 고블린 갱신      — index 0 → 1 → 2 순서로 §4.5 전체 (피격 처리 §6.3 포함)
6. 시간 감소        — timeRemainingSec -= dt * timeScale   (§6.2)
7. 종료 판정        — §6.4
8. elapsedSec += dt
```

**4번이 5번보다 먼저다.** 플레이어가 먼저 움직이고 고블린이 그 결과를 보고 반응한다.
반대로 하면 "고블린이 내가 갈 곳을 미리 알고 있는" 느낌이 난다.

### §6.2 시간 흐름

```
timeScale = (HIDING.ENABLED && 플레이어 중심 타일이 'S') ? HIDING.SPA_TIME_SCALE : HIDING.DEFAULT_TIME_SCALE
timeRemainingSec -= dt * timeScale
```

`HIDING.ENABLED == false`에서는 항상 `DEFAULT_TIME_SCALE`(=1)이다.
즉 **이 한 줄만 미리 써 두면 은신 승격 시 추가 작업이 없다.** 미리 쓰는 비용이 0에 가까워서 지금 넣는다.

> ✅ **2026-08-07: 실제로 그렇게 됐다.** 은신이 MUST로 승격되고 `HIDING.ENABLED`가 `true`가 됐을 때
> **sim 코드는 한 줄도 바뀌지 않았다.** 이 문단이 그 예측의 근거였고 예측이 맞았다.
> (`docs/DECISIONS.md` D9-d — GDD 12장이 적어 둔 "구현 비용이 크다"는 전제는 틀렸었다.)

### §6.3 피격 처리 — 순서 고정 (§4.7 ATTACK 진입 시 1회)

```
0. if player.invulnSec > 0:
     아무 것도 하지 않는다. 단 고블린은 ATTACK 상태로 들어가고 attackSec는 정상 설정된다
     → 무적 중 플레이어에게 붙어 있는 고블린이 1초마다 멈췄다 움직였다 한다. 의도한 동작이다
     종료
1. player.hp -= HIT.HP_LOSS
2. timeRemainingSec -= HIT.TIME_PENALTY_SEC        (0 미만이면 0으로 클램프)
3. 넉백:
     d = player.pos - g.pos
     dir = (|d| >= 1e-6) ? d / |d| : (-g.facing)     # 완전히 겹쳤으면 고블린 정면 반대로
     moveAxisX(player, dir.x * HIT.KNOCKBACK_PX)     # §3.3 그대로 사용 = 벽을 뚫지 않는다
     moveAxisY(player, dir.y * HIT.KNOCKBACK_PX)
4. if player.missionIndex != null && HIT.RESETS_MISSION_PROGRESS:
     player.missionIndex = null
     player.missionSec   = 0
5. player.invulnSec = HIT.INVULNERABLE_SEC
6. hits += 1
```

**순서를 이렇게 고정한 이유**:
- 0번이 맨 앞이라야 무적 중 데미지·시간 페널티가 **한 톨도** 새지 않는다
- 2번이 3번보다 먼저: 넉백 결과와 무관하게 시간 페널티는 확정이다
- 3번이 4번보다 먼저인 것은 무의미하지만 **순서를 정해 둬야 tech와 playtest가 같은 걸 만든다**
- 5번(무적 시작)이 **가장 마지막에 가까운** 이유: 0번의 무적 검사와 같은 틱에서 충돌하지 않게 하기 위함.
  고블린 3마리가 같은 틱에 접촉해도 **첫 번째(index 낮은) 고블린만 데미지를 준다.**
  이건 의도된 동작이다 — 같은 틱 3연타로 즉사하면 플레이어가 납득하지 못한다
- 6번(카운터)이 맨 끝: 통계는 규칙에 영향을 주지 않아야 한다

### §6.4 종료 판정 — 이 순서로

```
1. if player.hp <= 0:                cleared=false, lossCause='hp0',     종료
2. if timeRemainingSec <= 0:         cleared=false, lossCause='timeout', 종료
3. exitOpen = (completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS)
   if exitOpen && 제곱거리(player.pos, EXIT_POINT) <= ROUND.EXIT_REACH_RADIUS_PX^2:
     cleared=true, lossCause='none', timeRemainingSec 그대로,  종료
```

**hp0을 timeout보다 먼저 본다.** 마지막 일격이 체력을 0으로 만들면서 시간도 −10초 해서 동시에
시간이 0이 되는 경우, 원인은 `'hp0'`이다. GDD 7장의 "시간초과 : 체력0 ≈ 6:4" 지표가
이 우선순위에 의존하므로 반드시 고정한다.

**탈출구는 열려야만 도달 판정을 한다.** 열리기 전에 탈출구 위에 서 있어도 아무 일이 없고,
5개째 미션을 완료하는 순간 그 자리에서 판정되지 않는다(탈출구는 미션 지점과 다른 좌표이므로 자연히 배제).

`ROUND.EXIT_OPENS_AT_MISSIONS`(5)와 `MISSION.REQUIRED_COUNT`(5)는 값이 같지만 **의미가 다른 두 상수**다.
sim은 종료 판정에 `ROUND.EXIT_OPENS_AT_MISSIONS`만 쓴다. 하나만 참조해야 두 값이 어긋났을 때 티가 난다.

### §6.5 라운드 초기 상태

```
player.pos            = PLAYER_START (176, 976)
player.hp             = PLAYER.MAX_HP
player.facing         = (0, 1)                        # 아래. 시작 방에서 위로 나가지만 판정에 안 쓴다
player.invulnSec      = 0
player.dashSec        = 0
player.dashCooldownSec= 0
player.missionIndex   = null
player.missionSec     = 0
timeRemainingSec      = ROUND.TIME_LIMIT_SEC
completedCount        = 0
hits                  = 0
elapsedSec            = 0
고블린 i: pos = 순찰로[0], state='PATROL', wpIndex=1,
          facing = normalize(순찰로[1] - 순찰로[0]),
          lastSeenPos = pos, loseSightSec=0, searchSec=0, attackSec=0, avoidSec=0, stuckSec=0
미션: §5.6으로 5곳 active, 전부 done=false
```

`wpIndex = 1`인 것에 주의. 인덱스 0은 이미 서 있는 자리다.

**시작 유예**: 플레이어 시작 방(좌하단, §2.3)은 어떤 순찰로도 지나가지 않는다.
가장 가까운 고블린 goblin[1]의 시작점 (6,19)까지 11타일 = 352px이고 시야는 140px이므로,
**시작 즉시 발각되는 판은 존재하지 않는다.** 별도의 무적 시간 규칙을 만들지 않는 이유다.

---

## §7. 봇 정책 (`playtest` 전용)

### §7.0 이 봇의 목적과 위험

봇은 **밸런스를 재는 자**이지 노는 자가 아니다.
봇이 완벽하면 클리어율 100%, 형편없으면 0%가 되고, 어느 쪽이든 GDD 7장 목표 지표(35~55%)는
게임이 아니라 봇의 성질만 측정하게 된다. **목표는 사람 중급자.**

사람다움은 **손잡이 3개**로만 근사한다. 그 이상 늘리지 않는다 (봇 자체가 튜닝 대상이 되면 끝이 없다).
1. **반응 지연** `BOT.REACTION_DELAY_SEC` — 봇이 보는 고블린 위치가 과거다
2. **조준 흔들림** `BOT.AIM_JITTER_DEG` — 이동 방향이 미세하게 어긋난다
3. **위험 감수** `BOT.RISK_TOLERANCE_PX` — 얼마나 가까이 고블린이 있어도 미션을 시작하는가

> ⚠️ **조정 우선순위**: 지표가 어긋나면 먼저 손대는 것은 `GOBLIN`/`ROUND`/`MISSION`이다.
> 게임을 못 고쳐서 봇을 고치면 측정이 무의미해진다. `BOT` 값을 바꾼 경우 WORKLOG에 이유를 남긴다.

> 🛑 **역방향도 같은 강도로 성립한다 (2026-08-07 추가, `docs/DECISIONS.md` D8):**
> **봇이 고장 난 것을 보상하려고 게임 수치를 깎아도 측정은 무의미해진다.**
> 이쪽이 더 위험하다 — 앞쪽은 봇에 흔적이 남지만, 이쪽은 **게임 수치에 영구히 새겨지고
> 나중에 어느 값이 봇 결함의 보상분이었는지 구분할 수 없게 된다.**
>
> 판정 순서: 지표가 미달일 때 **먼저 봇이 규칙대로 움직이고 있는지부터 확인한다.**
> 최소 확인 항목 — 봇의 **실효 이격 속도**가 이론값(`PLAYER.BASE_SPEED − GOBLIN.CHASE_SPEED`)에
> 비해 터무니없이 낮지 않은가. 낮으면 그건 밸런스 문제가 아니다.
> (실제 사례: 라운드 2에서 이론 15px/s 대비 실측 2.2px/s(15%)가 나왔고, 그래서 밸런스 축을 동결했다.
> 수리 스펙 `docs/SPEC_BOT_FLEE_FIX.md`)
>
> 이 규칙에는 대가가 있다: 마감 안에 봇을 못 고치면 **목표 지표에 미달인 채로 제출하게 된다.**
> 그 대가를 치르기로 한 것이 D8-b의 결정이다. 미달은 숨기지 않고 기록한다.

### §7.1 봇의 지각 — 치팅 방지

봇은 **고블린의 `state`를 읽지 않는다.** (사람은 고블린이 CHASE인지 알 수 없다)
봇이 읽는 것은 다음뿐이다:

- 자기 상태 전부
- 미션 지점의 `pos` / `active` / `done` (사람은 맵을 보고 안다 — HUD에 표시되므로 치팅이 아니다)
- 탈출구 `pos`, `exitOpen`
- 고블린의 **지연된 위치**: `REACTION_DELAY_SEC` 전의 좌표.
  구현: 고블린마다 길이 `N = round(BOT.REACTION_DELAY_SEC / SIM.TIMESTEP_SEC)` (=15) 링 버퍼에
  매 틱 `pos`를 넣고, 봇은 가장 오래된 값을 읽는다. 버퍼가 다 차기 전(라운드 첫 15틱)에는 시작 좌표를 쓴다

### §7.2 위험 인지

```
danger(g) = ( 제곱거리(bot.pos, g.delayedPos) <= BOT.DANGER_RADIUS_PX^2 )
            && !rayHitsWall(bot.pos, g.delayedPos)
```

- **LOS를 요구한다.** 벽 너머 고블린은 무서워하지 않는다. 이게 봇을 "적당히 못하게" 만드는 핵심이다
  (실제로는 벽 뒤 고블린도 곧 나타날 수 있으므로, 봇은 여기서 손해를 본다 = 사람다움)
- `rayHitsWall`은 §4.4와 **같은 함수**를 쓴다. sim에 레이캐스트 구현은 하나뿐이다
- 히스테리시스: 이미 FLEE 중이면 해제 기준을 `BOT.DANGER_RELEASE_RADIUS_PX`(300px)로 넓힌다.
  같은 값이면 경계에서 FLEE↔SEEK가 매 틱 뒤집혀 봇이 제자리에서 떤다

### §7.3 이동 — 웨이포인트 격자 네비게이션

봇은 고블린과 **다른** 이동 규칙을 쓴다. 이유: 고블린이 벽에 잠깐 끼는 건 재미있지만,
봇이 끼면 그 판의 측정값이 통째로 쓰레기가 된다. **봇의 이동은 신뢰할 수 있어야 한다.**

§2.6의 12노드 격자를 그대로 쓴다. 격자 간선이 전부 벽 없는 직선임이 보장되므로 이게 성립한다.

```
navDir(from, to):
  1. if !rayHitsWall(from, to):  return normalize(to - from)      # 그냥 직선으로 간다
  2. entry = from에서 LOS가 뚫린 노드 중 가장 가까운 것
            (없으면 그냥 직선거리 최소 노드)
  3. goal  = to 에서 LOS가 뚫린 노드 중 to 에 가장 가까운 것
            (없으면 그냥 직선거리 최소 노드)
  4. BFS(entry → goal) on 12노드 4-이웃 격자 → 경로의 두 번째 노드 next
     (entry == goal 이면 next = goal)
  5. if |from - node(entry)| > BOT.ARRIVE_RADIUS_PX && entry != 현재 서 있는 노드:
       return normalize(node(entry) - from)      # 아직 격자에 못 올랐으면 entry로
     else:
       return normalize(node(next)  - from)
```

- BFS는 노드 12개·간선 17개다. 매 틱 돌려도 무시할 만하다. **캐시하지 않는다**(캐시 무효화 버그가 더 비싸다)
- 이웃 순회 순서는 **북 → 동 → 남 → 서** 고정. BFS 동률 시 결과가 갈리지 않게 한다
- 격자 밖(방 안쪽 구석)에서는 2번의 `entry`가 봇을 격자로 끌어올린다.
  §2.4 맵의 모든 바닥 타일은 최소 한 개의 격자 노드와 LOS가 뚫려 있다 — 방이 볼록하고 차폐물이 작기 때문이다

**조준 흔들림 적용** (마지막 단계):
```
매 BOT.JITTER_INTERVAL_SEC 마다 1회:
  jitterRad = (rng.next() - 0.5) * BOT.AIM_JITTER_DEG * PI / 180
최종 방향 = navDir 결과를 jitterRad 만큼 회전한 벡터
```
흔들림을 **매 틱 새로 뽑지 않는다.** 매 틱이면 서로 상쇄돼 아무 효과가 없다.

### §7.4 모드 — 매 틱 이 순서로 판정

```
1. if completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS      → ESCAPE
2. if 어떤 고블린이든 danger(g)                            → FLEE
3. if bot.missionIndex != null                            → DO_MISSION
4. else                                                    → SEEK
```

1번이 2번보다 먼저다: **탈출구가 열리면 봇은 겁을 내지 않고 직행한다.**
사람도 그렇게 하고, 이 규칙이 없으면 봇이 탈출구 앞에서 서성이다 시간초과로 죽어
`timeout : hp0` 비율이 왜곡된다.

| 모드 | 목표 | 이동 | 대시 | 상호작용 |
|---|---|---|---|---|
| `ESCAPE` | `EXIT_POINT` | `navDir` | `BOT.DASH_IN_ESCAPE` | — |
| `FLEE` | §7.5 회피 벡터 | 회피 벡터 직접 (navDir 아님) | `BOT.DASH_IN_FLEE` | — |
| `DO_MISSION` | — | 이동 입력 0 | 안 씀 | `interact=false`(이미 진행 중) |
| `SEEK` | §7.6 선택된 미션 지점 | `navDir` | `BOT.DASH_IN_SEEK` (기본 false) | §7.6 |

`FLEE` 진입 시 `bot.missionIndex != null`이면 이동 입력을 넣어 §5.4 2번으로 **자발적 중단**시킨다.
(별도 취소 API를 만들지 않는다. 봇은 사람과 완전히 같은 `SimInput`만 쓴다 — 이게 봇 신뢰성의 근거다)

### §7.5 FLEE 회피 벡터

```
sum = (0, 0)
for g in 위험한 고블린들:
  d = bot.pos - g.delayedPos
  if |d| >= 1e-6:  sum += d / |d|          # 정규화해서 더한다 = 거리와 무관하게 동등 가중
if |sum| < 1e-6:  sum = -bot.facing        # 완전히 상쇄된 드문 경우
dir = navDir(bot.pos, bot.pos + normalize(sum) * BOT.DANGER_RELEASE_RADIUS_PX)
```

마지막 줄이 중요하다. **회피 방향을 그대로 쓰지 않고 `navDir`을 한 번 통과시킨다.**
그냥 쓰면 봇이 벽 구석으로 도망쳐 갇힌다 — 사람이 절대 하지 않는 실수라 봇이 부당하게 약해진다.

> ⚠️ **이 식(거리 무관 동등 가중)이 봇 고장의 유력 원인으로 지목됐다** (2026-08-07).
> 위협 2마리가 반대편에 있으면 `|sum| → 0`이 되고, `normalize`가 서브픽셀 잔차를 길이 1의
> 방향으로 **증폭**해 도주 방향이 매 틱 흔들린다. `|sum| < 1e-6` 가드는 *정확한* 상쇄만 잡는다.
> 폴백 `-bot.facing`은 FLEE 중엔 **직전 도주 방향의 반대 = 위협 쪽**이라 진동을 키운다.
> → 대체안(거리 선형 가중 + 연속성 폴백)은 `docs/SPEC_BOT_FLEE_FIX.md`에 있다.
> **그 스펙이 인수되면 `gd`가 위 의사코드를 즉시 교체한다** (GDD 11장 9번: 문서 ↔ 코드 일치).
> 인수 전까지는 위 식이 유효한 원본이다 — 코드가 먼저 바뀌고 이 문단이 남으면 `verify` 반려 사유다.

### §7.6 SEEK — 목표 선택과 미션 시작

**목표 선택**: `active && !done`인 미션 지점 중 **직선거리 최소**. 동률이면 index 작은 쪽.

- 벽을 무시한 직선거리다. 실제 경로가 더 먼 지점을 고를 수 있다.
- **이건 의도한 핸디캡이다.** 정확한 경로거리로 고르면 봇이 사람보다 최적화를 잘하게 되고,
  클리어율이 위로 새어 나간다. 계산도 더 비싸다. 두 이유 모두 이 선택을 지지한다

**미션 시작 판단** (`SEEK` 중 목표에 도착했을 때):
```
if 제곱거리(bot.pos, target.pos) <= MISSION.INTERACT_RADIUS_PX^2:
  nearest = min over g of |bot.pos - g.delayedPos|   (LOS 뚫린 고블린만. 없으면 +Infinity)
  if nearest > BOT.RISK_TOLERANCE_PX:
    input.interact = true                            # 시작한다
  else:
    input.interact = false
    이동 방향 = §7.5의 회피 벡터                       # 서성이며 기다린다
```

이 조건이 이 봇의 "판단"이고, **GDD 2장 "언제 시작할지가 곧 실력"을 봇으로 옮긴 유일한 지점**이다.
`RISK_TOLERANCE_PX`가 크면 미션을 못 시작해 `timeout` 패배가 늘고, 작으면 미션 중 피격이 늘어
`hp0` 패배가 는다. → **GDD 7장의 `timeout : hp0 ≈ 6:4`를 맞추는 주 손잡이가 이것이다.**

### §7.7 대시

- `FLEE` / `ESCAPE`에서 `dashCooldownSec <= 0`이면 즉시 쓴다 (`BOT.DASH_IN_FLEE` / `DASH_IN_ESCAPE`)
- `SEEK`에서는 쓰지 않는다 (`BOT.DASH_IN_SEEK = false`).
  위험할 때 쓰려고 아껴 두는 것이 사람의 행동이고, 아무 때나 쓰면 이동 시간이 줄어 클리어율이 위로 샌다
- 대시 판단은 이 두 줄이 전부다. 쿨다운 예측·최적 타이밍 계산을 넣지 않는다

### §7.8 봇이 하지 않는 것 (명시적 제외)

- 고블린 순찰로 학습·예측 — 사람은 첫 판에 모른다
- 미션 순서 최적화(외판원) — §7.6의 최근접 그리디만 쓴다
- 은신(수풀·온천) 활용 — `HIDING.ENABLED == false`인 동안 규칙 자체가 없다.
  켤 때 봇 정책도 같이 확장해야 하며, 그건 이 스펙 밖이다
- 미니게임 실수 — §5.1대로 sim에 미니게임이 없다

---

## §8. 이 스펙에서 가장 위험한 규칙 3개

`tech`는 **여기부터 시간을 잰다.** 예상보다 오래 걸리면 즉시 `gd`에게 알린다.

| # | 규칙 | 왜 위험한가 | 넘어갔을 때의 대피로 |
|---|---|---|---|
| 1 | **§4.6 `steer` — 슬라이딩 + 우회 커밋** | 벽 충돌·진동·끼임이 얽힌 지점이고, **버그가 조용하다**(크래시가 아니라 "고블린이 좀 이상함"으로 나타난다). 4단 방어를 다 넣어야 안전한데 각 단이 서로를 가린다 — 1단이 고장 나도 4단이 덮어서 못 알아챈다 | `avoidSec`·`stuckSec`를 `SimResult`에 누적 통계로 노출한다. 우회 발동 횟수가 판당 100회를 넘거나 `stuckSec` 발동이 판당 5회를 넘으면 `gd`에게 반려한다 |
| 2 | **§4.4 DDA 레이캐스트** | 부호·경계·`t>1` 컷 중 하나만 틀려도 **벽을 통과해 보거나 아무것도 못 본다.** 게다가 §7.2·§7.3이 같은 함수를 쓰므로 **고블린과 봇이 동시에 미친다.** 원인 분리가 어렵다 | 맵 데이터가 고정이므로 **하드코딩된 케이스 테스트**가 가능하다: (6,7)↔(6,31) 뚫림 / (5,5)↔(30,5) 막힘(col12 벽) / (7,7)↔(7,8) 뚫림 등 8케이스를 `npm run sim`이 부팅 시 검사하게 한다 |
| 3 | **§7.3 봇 네비게이션 (BFS + entry/goal 선택)** | **봇이 이동에 실패하면 100회 시뮬 전체가 무의미해진다.** 게다가 실패가 "클리어율 0%"로 보여서 밸런스 문제와 구분되지 않는다 — 잘못된 밸런스 조정을 유발한다 | 시뮬 결과에 **`stuckRuns`**(60초 이상 완료 미션이 0인 판) 카운트를 넣는다. 0이 아니면 밸런스 판정 이전에 실패로 본다. `--assert`가 이걸 먼저 검사한다 |

> 3개 모두 **"조용히 틀리는" 부류**다. 4일 프로젝트에서 진짜 위험은 크래시가 아니라
> 그럴듯한 숫자가 나오는 잘못된 시뮬이다 (하네스 14).

부차적 위험 2건 (시간 재기 대상은 아니지만 기억해 둘 것):
- §5.6의 rng 호출 횟수 고정 — 어기면 시드 재현이 깨지고, 그건 `playtest`의 A/B 비교를 무효화한다
- §6.1의 틱 순서 — 렌더 씬이 나중에 자기 순서로 sim을 호출하면 브라우저와 헤드리스의 결과가 갈린다

---

## §9. 근거 없이 지어낸 값 목록 (하네스 14·16)

> **아래는 전부 `playtest` 미검증이다.** GDD에서 온 값(속도·시야·제한시간·체력 등)도 미검증 가설이지만,
> 아래 목록은 **가설조차 아니고 그냥 골라 놓은 수**다. 지표가 어긋났을 때 의심 순서가 여기서 정해진다.

### 9.1 순수하게 지어낸 값 (근거 = "그럴듯해 보여서")

| 상수 | 값 | 비고 |
|---|---|---|
| `GOBLIN.CHASE_STUCK_ABORT_SEC` | 1.5초 | 짧으면 정상 추격이 끊기고 길면 끼임이 눈에 띈다. 중간값 |
| `GOBLIN.SEARCH_TURN_DEG_PER_SEC` | 90 | 5초에 1.25바퀴 = "최소 한 바퀴"만 맞춘 값 |
| `GOBLIN.SEARCH_ARRIVE_RADIUS_PX` | 16 | 타일 반 칸 |
| `NAV.WAYPOINT_ARRIVE_RADIUS_PX` | 12 | 타일 약 0.4칸 |
| `NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK` | 0.2 | 가장 느린 기대 전진(1.0px/tick)의 20% |
| `NAV.AVOID_COMMIT_SEC` | 0.5 | 진동을 막을 만큼 길고 추격이 끊기지 않을 만큼 짧게 |
| `NAV.AVOID_PROBE_PX` | 24 | 타일 0.75칸 |
| `BOT.DANGER_RADIUS_PX` | 200 | 고블린 시야 140px보다 넉넉히 큼 |
| `BOT.DANGER_RELEASE_RADIUS_PX` | 300 | 진입의 1.5배 |
| `BOT.RISK_TOLERANCE_PX` | 220 | **1순위 조정 대상.** §7.6 |
| `BOT.REACTION_DELAY_SEC` | 0.25 | 사람 시각 반응 시간의 통상 범위에서 고른 값이나 이 게임으로 측정한 바 없음 |
| `BOT.AIM_JITTER_DEG` | 12 | ±6°. 근거 없음 |
| `BOT.JITTER_INTERVAL_SEC` | 0.4 | 근거 없음 |
| `BOT.ARRIVE_RADIUS_PX` | 8 | 근거 없음 |
| `SIM.DEFAULT_SEED` | 20260806 | 날짜. 값 자체에 의미 없음 |

### 9.1.1 라운드 1 측정으로 상태가 바뀐 값 (2026-08-07)

| 상수 | 값 | 상태 |
|---|---|---|
| `GOBLIN.CHASE_SPEED_PX_PER_SEC` | 95 → **75** | **모순 해소 + 라운드 2 축.** 95는 `PLAYER.BASE_SPEED`(90)보다 커서 GDD 6장 본문·`balance.ts` 주석과 모순이었다. playtest 실측 85 → 클리어율 11.3%(미달)를 근거로 한 번에 75로 내린다. D7 |
| `GOBLIN.VISION_RADIUS_PX` | 140 (유지) | playtest 단독 실측 100 → 12.9%(미달). **라운드 3 후보.** 이번 라운드에 같이 움직이지 않는다 |
| `PLAYER.MAX_HP` | 3 (유지) | 반증 실험용으로 99까지 올려 본 결과 `stuckRuns`가 급증 — `stuckRuns`가 치사율의 파생 지표임이 확인됐다. **값은 그대로** |

### 9.2 근거는 있으나 검증되지 않은 값

| 상수 | 값 | 근거 (검증 아님) |
|---|---|---|
| `PLAYER.HITBOX_W/H_PX` | 20 | 2타일 문(64px)과 32px 스프라이트 사이. 끼임 여유 확보 목적 |
| `GOBLIN.HITBOX_W/H_PX` | 20 | 플레이어와 동일하게 맞춤 |
| `WORLD.MAP_HEIGHT_PX` | 1184 | §1. 정수 타일 + "키우지 않는다" 원칙 |
| `MISSION.CANCEL_RESETS_PROGRESS` | true | GDD 2장 긴장의 출처 유지. **on/off 축이므로 playtest가 가장 쉽게 흔들 수 있는 값** |
| `HIDING.ENABLED` | false | GDD 10장 SHOULD |

### 9.3 맵 데이터 — 밸런스가 아니지만 검증되지 않음

- 벽 배치·방 12개·2타일 문·차폐물 형태 — **`playtest` 측정 없이 손으로 그렸다.**
- 미션 7곳 배치 — 최소 간격 12타일(384px)만 확인했다. 실제 이동 시간 분포는 미측정
- 순찰로 3개 — 모든 미션이 순찰로 2타일 이내가 되도록 **의도적으로 어렵게** 잡았다.
  클리어율이 35% 아래로 나오면 원인 1순위가 여기일 수 있으나, **맵 데이터는 밸런스 축이 아니므로**
  `GOBLIN.VISION_RADIUS_PX` 등을 먼저 조정하고, 그걸로도 안 되면 `gd`가 이 문서를 고친다

### 9.4 gd가 수동으로만 검증한 것 (실행 검증 아님 — 하네스 14)

다음 3건은 **손으로 문자열을 세어 확인**했다. 코드로 재검증하지 않았다. tech가 로드 시 단언으로 굳혀라.

1. 맵 37행 × 각 행 50자
2. `col 6/18/30/42`가 row 1~35 전 구간 벽 없음 / `row 7/19/31`이 col 1~48 전 구간 벽 없음 (§2.6)
3. 미션 7곳·고블린 3곳·`P`·`E` 각 개수와 좌표 (§2.5)

**2번이 틀리면 §4.4·§7.3이 조용히 고장 난다.** `verify`가 기계적으로 재확인할 것.
