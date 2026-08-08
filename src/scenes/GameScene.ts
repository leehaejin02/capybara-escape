import Phaser from 'phaser';
import { GOBLIN, MISSION, PLAYER, ROUND, SIM, WORLD } from '../config/balance';
import { createRng } from '../sim/rng';
import { createInitialState, step } from '../sim/world';
import { ACTIVE_ZONE, EXIT_POINT, MAP_ROWS, MISSION_POINTS } from '../sim/map';
import type { MissionType, SimInput, SimState, Vec2 } from '../sim/types';
import { UI_HEX, UI_TEXT } from './palette';
import { propAt } from './propPlacement';
import { playSfx } from '../audio/bgm';
import {
  DEFAULT_SELECTION,
  PLAYER_TEXTURE_KEY,
  REGISTRY_SELECTION_KEY,
  bakeCompositeTexture,
  type CustomizeSelection,
} from './spriteBake';
import { dirRowFromFacing, ensureWalkAnims, idleFrame, walkAnimKey } from './anims';
import { MinigameOverlay } from './minigames/MinigameOverlay';
import { drawPanel, drawHeart, HEART_COLS } from './uiPanel';

/**
 * GameScene — S3 인게임 (GDD 3장). sim의 `SimState`를 매 프레임 그리기만 한다.
 *
 * 게임 규칙 판정은 전부 `src/sim/`이 한다 — 이 씬은 상태를 읽어 그리는 것뿐이다
 * (CLAUDE.md 아키텍처 3). 고정 timestep(`SIM.TIMESTEP_SEC`)으로 sim을 구동하고,
 * Phaser의 가변 delta는 누적기(accumulator)로만 쓴다.
 *
 * 미션(§5): 미니게임 3종(M1 배선 / M2 온도 / M3 기억)은 `./minigames/`에 있고
 * `MinigameOverlay`가 수명주기를 관리한다. 완료 판정은 여전히 sim의
 * `player.missionSec`/`durationOf(type)`가 하고(RULES.md §5.1 — sim은 미니게임을 재현하지
 * 않는다), 미니게임이 sim에 영향을 주는 유일한 통로는 실패 시의 "자발적 중단" 입력
 * 1틱 주입(`overrideInput`)뿐이다. 하단 게이지는 변함없이 sim 진행도의 시각화다.
 */

/** 렌더 프레임이 한 번에 따라잡을 수 있는 최대 sim 틱 수. 밸런스 값이 아니라 "탭이 백그라운드에
 * 있다가 돌아왔을 때 한 프레임에 수십 틱을 몰아 계산해 멈칫하는 것"을 막는 렌더 안전장치다. */
const MAX_TICKS_PER_FRAME = 10;

/** HUD 텍스트/패널의 화면 좌표. 밸런스 수치가 아니라 UI 레이아웃 상수(px, 캔버스 좌표계). */
const HUD_HEART_CELL_PX = 3;
const HUD_HEART_GAP_PX = 6;

/**
 * 대시 게이지 줄의 화면 좌표. 밸런스 수치가 아니라 UI 레이아웃 상수(px, 캔버스 좌표계) —
 * 대시 지속·쿨다운 "값"은 balance.ts의 PLAYER.DASH_*에서 읽고, 여기 있는 숫자는 그 값을
 * 그릴 막대의 위치·크기일 뿐이다(하네스 2는 밸런스 수치에 적용되지, 픽셀 좌표엔 적용되지 않는다).
 */
const HUD_DASH_LABEL_X = 12;
const HUD_DASH_ROW_Y = 88;
const HUD_DASH_BAR_X = 64;
const HUD_DASH_BAR_W = 130;
const HUD_DASH_BAR_H = 12;
const HUD_DASH_TIME_TEXT_X = HUD_DASH_BAR_X + HUD_DASH_BAR_W + 6;
/** HUD 패널 전체 높이. 하트 아래에 대시 게이지 한 줄을 더 넣기 위해 92 → 116으로 확장. 폭 240은 유지. */
const HUD_PANEL_HEIGHT_PX = 116;

export class GameScene extends Phaser.Scene {
  private state!: SimState;
  private accumulatorSec = 0;
  private ended = false;
  /** 효과음용 이전 틱 값. sim 상태의 '변화'를 감지하는 용도일 뿐 판정에 쓰지 않는다. */
  private prevHits = 0;
  private prevCompleted = 0;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private goblinSprites: Phaser.GameObjects.Sprite[] = [];
  private missionSprites: Phaser.GameObjects.Sprite[] = [];
  private exitSprite!: Phaser.GameObjects.Sprite;
  private visionGfx!: Phaser.GameObjects.Graphics;

  private hudPanel!: Phaser.GameObjects.Graphics;
  private hudTimeText!: Phaser.GameObjects.Text;
  private hudMissionText!: Phaser.GameObjects.Text;
  private hpGfx!: Phaser.GameObjects.Graphics;
  private dashGaugeGfx!: Phaser.GameObjects.Graphics;
  private dashLabelText!: Phaser.GameObjects.Text;
  private dashTimeText!: Phaser.GameObjects.Text;
  private missionGaugeGfx!: Phaser.GameObjects.Graphics;
  private missionGaugeText!: Phaser.GameObjects.Text;
  private minigames!: MinigameOverlay;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;

  private lastPlayerPos: Vec2 = { x: 0, y: 0 };
  private lastGoblinPos: Vec2[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ended = false;
    this.accumulatorSec = 0;
    this.prevHits = 0;
    this.prevCompleted = 0;

    // 헤드리스 시뮬(§7 봇)과 달리 실제 플레이는 매 판 다른 미션 배치를 원한다.
    // 시드는 밸런스 수치가 아니라 "이번 판을 재현 가능하게 만드는 값"일 뿐이다.
    const seed = Date.now() % 0x7fffffff;
    this.state = createInitialState(createRng(seed));

    this.cameras.main.setBackgroundColor(UI_TEXT.ink);

    this.buildTilemap();
    this.buildMarkers();
    this.visionGfx = this.add.graphics().setDepth(0.5);
    this.buildPlayer();
    this.buildGoblins();
    this.buildHud();
    this.minigames = new MinigameOverlay(this);

    this.cameras.main.setBounds(0, 0, WORLD.MAP_WIDTH_PX, WORLD.MAP_HEIGHT_PX);
    this.cameras.main.startFollow(this.playerSprite, true, 1, 1);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  /** '#'인지 여부만 보는 지역 판정. MAP_ROWS를 직접 읽는 것은 buildTilemap이 이미 하던 방식
   * 그대로다(§2.2 남북 이웃 마스크·§3.4 드롭섀도 조건 둘 다 "그 칸이 벽인가"만 필요하고,
   * 맵 밖은 테두리 벽이라 실제로는 발생하지 않는다 — 이 씬은 여전히 sim 상태를 판정하지
   * 않고 정적 맵 문자만 읽는다, CLAUDE.md 하네스 3). */
  private isWallChar(col: number, row: number): boolean {
    if (row < 0 || row >= MAP_ROWS.length) return true;
    const line = MAP_ROWS[row];
    if (col < 0 || col >= line.length) return true;
    return line[col] === '#';
  }

  private buildTilemap(): void {
    const T = WORLD.TILE_SIZE_PX;
    // SPEC_ZONES.md §1 깊이 순서: 바닥 < 드롭섀도 < 소품 < marker_* < 캐릭터 < 수풀 캐노피 < UI.
    // 바닥/벽 depth 0, 드롭섀도 0.4, 소품 0.6, marker_* 1(불변), 캐릭터 2000+y(불변).
    // 캐노피는 "캐릭터보다 위"만 요구되므로 캐릭터가 도달 가능한 최대 depth(2000+MAP_HEIGHT_PX)
    // 보다 확실히 큰 상수를 쓴다 — 특정 타일 y와 결부시키지 않아도 전역적으로 항상 위다.
    const FLOOR_DEPTH = 0;
    const SHADOW_DEPTH = 0.4;
    const PROP_DEPTH = 0.6;
    const CANOPY_DEPTH = 2000 + WORLD.MAP_HEIGHT_PX + T;
    // SPEC_MAPS.md R4/§5: 맵마다 테마가 하나로 고정된다 — 더 이상 행마다 zoneOfRow(row)를
    // 다시 계산하지 않는다(폐기). 활성 맵의 zone은 create()가 createInitialState()를 먼저
    // 호출해 둔 뒤이므로 이 시점엔 이번 라운드가 고른 맵의 값이다.
    const zone = ACTIVE_ZONE;
    for (let row = 0; row < MAP_ROWS.length; row++) {
      const line = MAP_ROWS[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        const x = col * T;
        const y = row * T;
        let img: Phaser.GameObjects.Image;
        if (ch === '#') {
          // SPEC_ZONES.md §3.1: variant = (isSolid(north)?2:0) + (isSolid(south)?1:0), frameIndex = zone*4+variant.
          const northSolid = this.isWallChar(col, row - 1);
          const southSolid = this.isWallChar(col, row + 1);
          const variant = (northSolid ? 2 : 0) + (southSolid ? 1 : 0);
          img = this.add.image(x, y, 'tile_wall', zone * 4 + variant);
        } else if (ch === 'B') {
          // SPEC_ZONES.md §5.4: layer 0(바탕). layer 1(캐노피)은 §6대로 HIDING.ENABLED와 무관하게
          // 항상 그린다 — 렌더가 게임 상태를 판정하지 않는다(하네스 3).
          img = this.add.image(x, y, 'tile_bush', zone * 2 + 0);
          this.add.image(x, y, 'tile_bush', zone * 2 + 1).setOrigin(0, 0).setDepth(CANOPY_DEPTH);
        } else if (ch === 'S') {
          // SPEC_ZONES.md §5.5: frameIndex = zone (COLS=1). 행 0·2가 행 1과 픽셀 동일하게 구워져
          // 있으므로 여기서 예외 분기가 필요 없다.
          img = this.add.image(x, y, 'tile_spa', zone);
        } else {
          // '.', 'M', 'E', 'P', 'G'는 전부 "바닥 + 앵커"다(RULES.md §2.2) — 바닥은 항상 tile_floor.
          // ART.md §3.4의 결정적 변형 선택식은 그대로, frameIndex만 SPEC_ZONES.md §5.3대로
          // zone*4+variant로 바뀌었다.
          const variant = (col * 7 + row * 13) % 4;
          img = this.add.image(x, y, 'tile_floor', zone * 4 + variant);
        }
        img.setOrigin(0, 0).setDepth(FLOOR_DEPTH);

        // SPEC_ZONES.md §3.4: 드롭섀도는 "바닥 타일(비-벽)이고 북쪽이 벽"일 때만 그린다.
        if (ch !== '#' && this.isWallChar(col, row - 1)) {
          this.add.image(x, y, 'tile_shadow').setOrigin(0, 0).setDepth(SHADOW_DEPTH);
        }

        // SPEC_ZONES.md §4.1: 소품은 순수 바닥('.') 타일에만 놓는다 — B/S/M/E/P/G/#는 대상이 아니다.
        if (ch === '.') {
          const prop = propAt(col, row);
          if (prop) {
            this.add.image(x, y, 'props', prop.zone * 4 + prop.index).setOrigin(0, 0).setDepth(PROP_DEPTH);
          }
        }
      }
    }
  }

  private buildMarkers(): void {
    this.missionSprites = MISSION_POINTS.map((m) => this.add.sprite(m.pos.x, m.pos.y, 'marker_mission', 0).setDepth(1));
    this.exitSprite = this.add.sprite(EXIT_POINT.x, EXIT_POINT.y, 'marker_exit', 0).setDepth(1);
  }

  private buildPlayer(): void {
    if (!this.textures.exists(PLAYER_TEXTURE_KEY)) {
      // GameScene을 CustomizeScene 없이 직접 연 경우(디버깅 등) 대비 폴백. 정상 플로우에서는
      // CustomizeScene이 이미 구워 뒀다.
      const stored = this.registry.get(REGISTRY_SELECTION_KEY) as CustomizeSelection | undefined;
      bakeCompositeTexture(this, stored ?? DEFAULT_SELECTION, PLAYER_TEXTURE_KEY);
    }
    // force=true: bakeCompositeTexture가 매 판 같은 키로 텍스처를 파괴 후 재생성하므로,
    // 이전 판의 애니메이션이 남아 있으면 이미 파괴된 프레임을 계속 참조한다(anims.ts 주석 참조).
    ensureWalkAnims(this, PLAYER_TEXTURE_KEY, 'player', true);
    this.playerSprite = this.add.sprite(this.state.player.pos.x, this.state.player.pos.y, PLAYER_TEXTURE_KEY, 0);
    this.lastPlayerPos = { ...this.state.player.pos };
  }

  private buildGoblins(): void {
    ensureWalkAnims(this, 'goblin_walk', 'goblin');
    this.goblinSprites = this.state.goblins.map((g) => this.add.sprite(g.pos.x, g.pos.y, 'goblin_walk', 0));
    this.lastGoblinPos = this.state.goblins.map((g) => ({ ...g.pos }));
  }

  private buildHud(): void {
    const { width, height } = this.scale;

    // 픽셀아트 프레임(1px ink 외곽선 + warm_tan 안쪽 강조선) — uiPanel.ts, HUD·타이틀·결과 공통 톤.
    this.hudPanel = this.add.graphics().setScrollFactor(0).setDepth(3000);
    drawPanel(this.hudPanel, 0, 0, 240, HUD_PANEL_HEIGHT_PX);

    this.hudTimeText = this.add
      .text(12, 10, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3001);
    this.hudMissionText = this.add
      .text(12, 36, '', { fontFamily: 'monospace', fontSize: '16px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3001);
    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(3001);

    this.dashGaugeGfx = this.add.graphics().setScrollFactor(0).setDepth(3001);
    this.dashLabelText = this.add
      .text(HUD_DASH_LABEL_X, HUD_DASH_ROW_Y - 2, '대시', { fontFamily: 'monospace', fontSize: '14px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3002);
    this.dashTimeText = this.add
      .text(HUD_DASH_TIME_TEXT_X, HUD_DASH_ROW_Y - 2, '', { fontFamily: 'monospace', fontSize: '12px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3002);

    this.missionGaugeGfx = this.add.graphics().setScrollFactor(0).setDepth(3000).setVisible(false);
    this.missionGaugeText = this.add
      .text(width / 2, height - 90, '', { fontFamily: 'monospace', fontSize: '14px', color: UI_TEXT.capyWhite })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001)
      .setVisible(false);
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;

    this.lastPlayerPos = { ...this.state.player.pos };
    this.lastGoblinPos = this.state.goblins.map((g) => ({ ...g.pos }));

    this.accumulatorSec += deltaMs / 1000;
    const dt = SIM.TIMESTEP_SEC;
    let ticks = 0;
    while (this.accumulatorSec >= dt && ticks < MAX_TICKS_PER_FRAME && !this.state.ended) {
      // 미니게임 실패 리셋이 예약돼 있으면 이 틱의 입력을 "자발적 중단"으로 대체한다(1회성).
      // sim에 영향을 주는 유일한 통로가 이 공식 입력 경로다 (MinigameOverlay 주석 참조).
      const input = this.minigames.overrideInput(this.state) ?? this.readInput();
      step(this.state, input, dt);
      this.accumulatorSec -= dt;
      ticks++;
    }

    this.render();
    this.minigames.sync(this.state, this.time.now);

    // 효과음은 sim 상태의 '변화'만 보고 낸다. 씬이 판정에 관여하지 않는다.
    if (this.state.hits > this.prevHits) playSfx('hit');
    if (this.state.completedCount > this.prevCompleted) playSfx('missionComplete');
    this.prevHits = this.state.hits;
    this.prevCompleted = this.state.completedCount;

    if (this.state.ended && !this.ended) {
      this.ended = true;
      if (this.state.cleared) playSfx('escape');
      this.minigames.teardown();
      this.scene.start('ResultScene', {
        cleared: this.state.cleared,
        lossCause: this.state.lossCause,
        timeRemainingSec: this.state.timeRemainingSec,
        completedCount: this.state.completedCount,
        hits: this.state.hits,
      });
    }
  }

  private readInput(): SimInput {
    let moveX = 0;
    let moveY = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) moveX -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) moveX += 1;
    if (this.cursors.up.isDown || this.keyW.isDown) moveY -= 1;
    if (this.cursors.down.isDown || this.keyS.isDown) moveY += 1;
    return { moveX, moveY, interact: this.keyE.isDown, dash: this.keyShift.isDown };
  }

  private render(): void {
    const p = this.state.player;
    this.playerSprite.setPosition(p.pos.x, p.pos.y);
    const dir = dirRowFromFacing(p.facing);
    const moved = Math.hypot(p.pos.x - this.lastPlayerPos.x, p.pos.y - this.lastPlayerPos.y) > 0.05;
    if (moved && p.missionIndex === null) {
      this.playerSprite.play(walkAnimKey('player', dir), true);
    } else {
      this.playerSprite.anims.stop();
      this.playerSprite.setFrame(idleFrame(dir, 4));
    }
    // 무적 시간 깜빡임 — 피격을 알리는 순수 표현. 판정에 관여하지 않는다.
    this.playerSprite.setAlpha(p.invulnSec > 0 && Math.floor(this.time.now / 80) % 2 === 0 ? 0.4 : 1);
    this.playerSprite.setDepth(2000 + p.pos.y);

    this.state.goblins.forEach((g, i) => {
      const sprite = this.goblinSprites[i];
      sprite.setPosition(g.pos.x, g.pos.y);
      const gDir = dirRowFromFacing(g.facing);
      const gMoved = Math.hypot(g.pos.x - this.lastGoblinPos[i].x, g.pos.y - this.lastGoblinPos[i].y) > 0.05;
      if (g.state === 'ATTACK') {
        sprite.anims.stop();
        sprite.setFrame(idleFrame(gDir, 4));
        sprite.setTintFill(0xff3b3b); // 공격 상태 표현 — ART.md §3.3/§5 "런타임 틴트 플래시"
      } else {
        sprite.clearTint();
        if (gMoved) {
          sprite.play(walkAnimKey('goblin', gDir), true);
        } else {
          sprite.anims.stop();
          sprite.setFrame(idleFrame(gDir, 4));
        }
      }
      sprite.setDepth(2000 + g.pos.y);
    });

    this.missionSprites.forEach((sprite, i) => {
      const m = this.state.missions[i];
      sprite.setFrame(!m.active ? 0 : m.done ? 2 : 1);
    });
    this.exitSprite.setFrame(this.state.completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS ? 1 : 0);

    this.renderVision();
    this.renderHud();
  }

  /** 고블린 시야 부채꼴을 시각화한다(GDD 10장 "SHOULD 아님" — tech 재량으로 추가).
   * 왜 쫓기는지 플레이어가 알 수 있게 하기 위함. 판정에는 쓰지 않는다 — sim의 `canSee`가 이미 판정했다. */
  private renderVision(): void {
    this.visionGfx.clear();
    const halfAngleRad = ((GOBLIN.VISION_ANGLE_DEG / 2) * Math.PI) / 180;
    for (const g of this.state.goblins) {
      const angle = Math.atan2(g.facing.y, g.facing.x);
      const alerted = g.state === 'CHASE' || g.state === 'ATTACK';
      this.visionGfx.fillStyle(alerted ? 0xff3b3b : UI_HEX.accentAmber, alerted ? 0.22 : 0.12);
      this.visionGfx.beginPath();
      this.visionGfx.moveTo(g.pos.x, g.pos.y);
      this.visionGfx.arc(g.pos.x, g.pos.y, GOBLIN.VISION_RADIUS_PX, angle - halfAngleRad, angle + halfAngleRad, false);
      this.visionGfx.closePath();
      this.visionGfx.fillPath();
    }
  }

  private renderHud(): void {
    const s = this.state;
    const totalSec = Math.max(0, Math.ceil(s.timeRemainingSec));
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    const warn = s.timeRemainingSec <= 30;
    this.hudTimeText.setText(`남은 시간 ${mm}:${String(ss).padStart(2, '0')}`).setColor(warn ? UI_TEXT.accentAmber : UI_TEXT.capyWhite);
    this.hudMissionText.setText(`미션 ${s.completedCount}/${MISSION.REQUIRED_COUNT}`);

    this.hpGfx.clear();
    const startX = 12;
    const startY = 60;
    const heartWidthPx = HEART_COLS * HUD_HEART_CELL_PX;
    for (let i = 0; i < PLAYER.MAX_HP; i++) {
      const filled = i < s.player.hp;
      drawHeart(this.hpGfx, startX + i * (heartWidthPx + HUD_HEART_GAP_PX), startY, HUD_HEART_CELL_PX, filled ? UI_HEX.accentAmber : UI_HEX.capyGrayDark);
    }

    this.renderDashGauge(s.player.dashSec, s.player.dashCooldownSec);

    if (s.player.missionIndex !== null) {
      const type = s.missions[s.player.missionIndex].type;
      const duration = this.missionDurationSec(type);
      const ratio = Phaser.Math.Clamp(s.player.missionSec / duration, 0, 1);
      const { width, height } = this.scale;
      const barW = 260;
      const barH = 18;
      const barX = width / 2 - barW / 2;
      const barY = height - 70;

      this.missionGaugeGfx.setVisible(true);
      this.missionGaugeText.setVisible(true);
      this.missionGaugeGfx.clear();
      drawPanel(this.missionGaugeGfx, barX - 10, barY - 26, barW + 20, barH + 34);
      this.missionGaugeGfx.fillStyle(UI_HEX.capyGrayDark, 1);
      this.missionGaugeGfx.fillRect(barX, barY, barW, barH);
      this.missionGaugeGfx.fillStyle(UI_HEX.accentAmber, 1);
      this.missionGaugeGfx.fillRect(barX, barY, barW * ratio, barH);

      this.missionGaugeText.setPosition(width / 2, barY - 12);
      this.missionGaugeText.setText(`미션 ${type} 진행 중 (이동하면 취소·진행도 초기화)`);
    } else {
      this.missionGaugeGfx.setVisible(false);
      this.missionGaugeText.setVisible(false);
    }
  }

  /**
   * 대시 게이지 한 줄 — 값은 sim이 이미 감소시켜 둔 `player.dashSec`/`dashCooldownSec`을
   * 읽기만 한다(하네스 3, `src/sim/` 미수정). 채움 비율 계산에 쓰는 유일한 밸런스 상수는
   * `PLAYER.DASH_COOLDOWN_SEC`이고, 이 씬은 그 상수를 리터럴로 베끼지 않고 balance.ts에서
   * 그대로 import해 쓴다.
   *
   * `dashCooldownSec`은 world.ts가 매 틱 빼기만 해 음수까지 내려갈 수 있으므로
   * 반드시 `Phaser.Math.Clamp`로 0~1에 묶는다 — 안 그러면 막대가 넘친다.
   */
  private renderDashGauge(dashSec: number, dashCooldownSec: number): void {
    this.dashGaugeGfx.clear();
    this.dashGaugeGfx.fillStyle(UI_HEX.capyGrayDark, 1);
    this.dashGaugeGfx.fillRect(HUD_DASH_BAR_X, HUD_DASH_ROW_Y, HUD_DASH_BAR_W, HUD_DASH_BAR_H);

    let ratio: number;
    let color: number;
    let timeLabel: string;
    if (dashSec > 0) {
      ratio = 1;
      color = UI_HEX.capyWhite;
      timeLabel = '';
    } else if (dashCooldownSec > 0) {
      ratio = Phaser.Math.Clamp(1 - dashCooldownSec / PLAYER.DASH_COOLDOWN_SEC, 0, 1);
      color = UI_HEX.warmTan;
      timeLabel = dashCooldownSec.toFixed(1);
    } else {
      ratio = 1;
      color = UI_HEX.accentAmber;
      timeLabel = '';
    }

    this.dashGaugeGfx.fillStyle(color, 1);
    this.dashGaugeGfx.fillRect(HUD_DASH_BAR_X, HUD_DASH_ROW_Y, HUD_DASH_BAR_W * ratio, HUD_DASH_BAR_H);
    this.dashTimeText.setText(timeLabel);
  }

  /**
   * 미션 게이지 표시 전용 소요시간 조회. sim의 완료 판정은 `src/sim/mission.ts`의
   * `durationOf`가 한다(RULES.md §5.1·§5.4) — 여기는 그 결과를 막대 비율로 그리기 위해
   * 같은 balance.ts 상수를 다시 읽을 뿐, 완료 여부를 스스로 판단하지 않는다.
   */
  private missionDurationSec(type: MissionType): number {
    switch (type) {
      case 'M1':
        return MISSION.M1_WIRING_DURATION_SEC;
      case 'M2':
        return MISSION.M2_TEMPERATURE_DURATION_SEC;
      case 'M3':
        return MISSION.M3_MEMORY_DURATION_SEC;
    }
  }
}
