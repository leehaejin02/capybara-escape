import Phaser from 'phaser';
import { GOBLIN, MISSION, PLAYER, ROUND, SIM, WORLD } from '../config/balance';
import { createRng } from '../sim/rng';
import { createInitialState, step } from '../sim/world';
import { EXIT_POINT, MAP_ROWS, MISSION_POINTS } from '../sim/map';
import type { MissionType, SimInput, SimState, Vec2 } from '../sim/types';
import { UI_HEX, UI_TEXT } from './palette';
import {
  DEFAULT_SELECTION,
  PLAYER_TEXTURE_KEY,
  REGISTRY_SELECTION_KEY,
  bakeCompositeTexture,
  type CustomizeSelection,
} from './spriteBake';
import { dirRowFromFacing, ensureWalkAnims, idleFrame, walkAnimKey } from './anims';

/**
 * GameScene — S3 인게임 (GDD 3장). sim의 `SimState`를 매 프레임 그리기만 한다.
 *
 * 게임 규칙 판정은 전부 `src/sim/`이 한다 — 이 씬은 상태를 읽어 그리는 것뿐이다
 * (CLAUDE.md 아키텍처 3). 고정 timestep(`SIM.TIMESTEP_SEC`)으로 sim을 구동하고,
 * Phaser의 가변 delta는 누적기(accumulator)로만 쓴다.
 *
 * ⚠️ 미션(§5): 시간 여유가 없어 미니게임 3종(배선/온도/기억) 대신 **"E를 누르고 서 있으면
 * 게이지가 찬다"**로 대체했다. 완료 판정은 전부 sim의 `player.missionSec`/`durationOf(type)`가
 * 하고, 이 씬은 그 비율을 막대로 그리기만 한다 — RULES.md §5.1이 이미 이 괴리(sim은 미니게임을
 * 재현하지 않는다)를 문서화해 뒀고, 이번 구현은 조작 난이도까지 0으로 만들어 그 괴리를 더 키웠다.
 * `tech` 보고 참고.
 */

/** 렌더 프레임이 한 번에 따라잡을 수 있는 최대 sim 틱 수. 밸런스 값이 아니라 "탭이 백그라운드에
 * 있다가 돌아왔을 때 한 프레임에 수십 틱을 몰아 계산해 멈칫하는 것"을 막는 렌더 안전장치다. */
const MAX_TICKS_PER_FRAME = 10;

/** HUD 텍스트/패널의 화면 좌표. 밸런스 수치가 아니라 UI 레이아웃 상수(px, 캔버스 좌표계). */
const HUD_HP_BOX_SIZE_PX = 16;
const HUD_HP_BOX_GAP_PX = 6;

export class GameScene extends Phaser.Scene {
  private state!: SimState;
  private accumulatorSec = 0;
  private ended = false;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private goblinSprites: Phaser.GameObjects.Sprite[] = [];
  private missionSprites: Phaser.GameObjects.Sprite[] = [];
  private exitSprite!: Phaser.GameObjects.Sprite;
  private visionGfx!: Phaser.GameObjects.Graphics;

  private hudPanel!: Phaser.GameObjects.Graphics;
  private hudTimeText!: Phaser.GameObjects.Text;
  private hudMissionText!: Phaser.GameObjects.Text;
  private hpGfx!: Phaser.GameObjects.Graphics;
  private missionGaugeGfx!: Phaser.GameObjects.Graphics;
  private missionGaugeText!: Phaser.GameObjects.Text;

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

  private buildTilemap(): void {
    const T = WORLD.TILE_SIZE_PX;
    for (let row = 0; row < MAP_ROWS.length; row++) {
      const line = MAP_ROWS[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        const x = col * T;
        const y = row * T;
        let img: Phaser.GameObjects.Image;
        if (ch === '#') {
          img = this.add.image(x, y, 'tile_wall');
        } else if (ch === 'B') {
          img = this.add.image(x, y, 'tile_bush');
        } else {
          // '.', 'M', 'E', 'P', 'G'는 전부 "바닥 + 앵커"다(RULES.md §2.2) — 바닥은 항상 tile_floor.
          // 'S'(온천)만 예외로 tile_spa. ART.md §3.4의 결정적 변형 선택식.
          if (ch === 'S') {
            img = this.add.image(x, y, 'tile_spa');
          } else {
            const variant = (col * 7 + row * 13) % 4;
            img = this.add.image(x, y, 'tile_floor', variant);
          }
        }
        img.setOrigin(0, 0).setDepth(0);
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

    this.hudPanel = this.add.graphics().setScrollFactor(0).setDepth(3000);
    this.hudPanel.fillStyle(UI_HEX.ink, 0.8);
    this.hudPanel.fillRect(0, 0, 240, 92);

    this.hudTimeText = this.add
      .text(12, 10, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3001);
    this.hudMissionText = this.add
      .text(12, 36, '', { fontFamily: 'monospace', fontSize: '16px', color: UI_TEXT.capyWhite })
      .setScrollFactor(0)
      .setDepth(3001);
    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(3001);

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
      const input = this.readInput();
      step(this.state, input, dt);
      this.accumulatorSec -= dt;
      ticks++;
    }

    this.render();

    if (this.state.ended && !this.ended) {
      this.ended = true;
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
    const startY = 62;
    for (let i = 0; i < PLAYER.MAX_HP; i++) {
      const filled = i < s.player.hp;
      this.hpGfx.fillStyle(filled ? UI_HEX.accentAmber : UI_HEX.capyGrayDark, 1);
      this.hpGfx.fillRect(startX + i * (HUD_HP_BOX_SIZE_PX + HUD_HP_BOX_GAP_PX), startY, HUD_HP_BOX_SIZE_PX, HUD_HP_BOX_SIZE_PX);
    }

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
      this.missionGaugeGfx.fillStyle(UI_HEX.ink, 0.8);
      this.missionGaugeGfx.fillRect(barX - 10, barY - 26, barW + 20, barH + 34);
      this.missionGaugeGfx.fillStyle(UI_HEX.capyGrayDark, 1);
      this.missionGaugeGfx.fillRect(barX, barY, barW, barH);
      this.missionGaugeGfx.fillStyle(UI_HEX.accentAmber, 1);
      this.missionGaugeGfx.fillRect(barX, barY, barW * ratio, barH);

      this.missionGaugeText.setPosition(width / 2, barY - 12);
      this.missionGaugeText.setText(`미션 ${type} 진행 중 — 가만히 있으면 완료된다 (움직이면 취소)`);
    } else {
      this.missionGaugeGfx.setVisible(false);
      this.missionGaugeText.setVisible(false);
    }
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
