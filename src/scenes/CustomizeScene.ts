import Phaser from 'phaser';
import { UI_TEXT } from './palette';
import { addCozySkyBackground } from './background';
import { drawPanel } from './uiPanel';
import {
  DEFAULT_SELECTION,
  PLAYER_TEXTURE_KEY,
  REGISTRY_SELECTION_KEY,
  bakeCompositeTexture,
  bodyTextureKey,
  hatTextureKey,
  outfitTextureKey,
  type CustomizeSelection,
} from './spriteBake';

/**
 * CustomizeScene — S2 커스터마이즈 (GDD 3·4장).
 *
 * body 4 × outfit 5 × hat 4를 실시간 미리보기로 고르고, "입장" 확정 시
 * `bakeCompositeTexture`로 1회 합성한다. 합성 결과 키는 레지스트리에 저장돼
 * GameScene·ResultScene이 그대로 읽는다 (GDD 11장 2번 — 커스터마이즈 반영 필수).
 *
 * 이 씬은 렌더링만 한다. 게임 규칙 판정은 없다 (CLAUDE.md 아키텍처 3).
 *
 * S1(BootScene)·S4(ResultScene)와 같은 어휘를 그대로 재사용한다(새 컴포넌트를 만들지 않는다):
 * `addCozySkyBackground`(하늘 배경) + `drawPanel`(ink 패널 — 미리보기 받침 1개, 항목+입장 버튼 1개).
 */

const BODY_NAMES = ['기본갈색', '연갈색', '회색', '흰색'];
// 2026-08-08: 아트를 AI 생성본으로 교체하면서(DECISIONS.md D14) 이름을 실물에 맞췄다.
// 이전 값은 '수건'/'우비'/'작업복'/'유자'였는데 그런 그림은 이번 세트에 없다 —
// 화면의 글자와 그림이 다른 상태였다.
const OUTFIT_NAMES = ['없음', '멜빵바지', '망토', '조끼', '스카프'];
const HAT_NAMES = ['없음', '밀짚모자', '마법사모자', '헬멧'];

/** BootScene·ResultScene과 같은 하늘 텍스처 키 — 이미 구워져 있으면 재사용한다(background.ts). */
const SKY_BG_KEY = 'ui_cozy_sky';

/** 미리보기 확대 배율. 정수 스케일만(GDD 8장 — 픽셀아트 서브픽셀 금지).
 * 커스터마이즈의 주인공이 부속품처럼 보이지 않도록 이전(4)보다 키운다. */
const PREVIEW_SCALE = 6;
/** 미리보기 받침 패널이 스프라이트 테두리에서 얼마나 여유를 두는지(px). */
const PREVIEW_PANEL_PAD_X = 40;
const PREVIEW_PANEL_PAD_Y = 18;
/** 미리보기 받침 패널 상단 y좌표. */
const PREVIEW_PANEL_TOP = 54;

/** 항목 패널 안쪽 여백(px). BootScene 조작키 패널과 같은 상수 값(28/16)을 쓴다 — 톤 통일. */
const ITEMS_PANEL_PAD_X = 28;
const ITEMS_PANEL_PAD_Y = 20;

type Category = 'body' | 'outfit' | 'hat';

export class CustomizeScene extends Phaser.Scene {
  private selection: CustomizeSelection = { ...DEFAULT_SELECTION };
  private focus: Category = 'body';

  private previewBody!: Phaser.GameObjects.Image;
  private previewOutfit!: Phaser.GameObjects.Image;
  private previewHat!: Phaser.GameObjects.Image;

  private rowTexts: Record<Category, Phaser.GameObjects.Text> = {} as Record<Category, Phaser.GameObjects.Text>;
  private rowFocusMarks: Record<Category, Phaser.GameObjects.Text> = {} as Record<Category, Phaser.GameObjects.Text>;

  constructor() {
    super('CustomizeScene');
  }

  create(): void {
    const stored = this.registry.get(REGISTRY_SELECTION_KEY) as CustomizeSelection | undefined;
    this.selection = stored ? { ...stored } : { ...DEFAULT_SELECTION };

    const { width } = this.scale;

    // BootScene·ResultScene과 같은 하늘 배경(검은 배경 대신). 맨 먼저 그려 최하단에 깐다.
    addCozySkyBackground(this, width, this.scale.height, SKY_BG_KEY);

    // 밝은 하늘 위라 흰 글자만으로는 대비가 약하다 — ink 외곽선을 둘러 어떤 배경에서도 읽히게 한다.
    this.add
      .text(width / 2, 32, '카피바라 꾸미기', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: UI_TEXT.capyWhite,
        stroke: UI_TEXT.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // ── 미리보기 받침(uiPanel.drawPanel) — 확대한 카피바라를 패널 위에 올려 주인공으로 세운다. ──
    const previewSpritePx = 32 * PREVIEW_SCALE;
    const previewPanelW = previewSpritePx + PREVIEW_PANEL_PAD_X * 2;
    const previewPanelH = previewSpritePx + PREVIEW_PANEL_PAD_Y * 2;
    const previewPanelX = width / 2 - previewPanelW / 2;
    const previewPanelGfx = this.add.graphics();
    drawPanel(previewPanelGfx, previewPanelX, PREVIEW_PANEL_TOP, previewPanelW, previewPanelH);

    // ── 미리보기(down, frame 0 고정) — 3레이어를 그대로 겹쳐 보여준다. 게임플레이 무영향(GDD 4장). ──
    const previewX = width / 2;
    const previewY = PREVIEW_PANEL_TOP + previewPanelH / 2;
    this.previewBody = this.add.image(previewX, previewY, bodyTextureKey(this.selection.bodyIndex), 0).setScale(PREVIEW_SCALE);
    this.previewOutfit = this.add
      .image(previewX, previewY, outfitTextureKey(this.selection.outfitIndex), 0)
      .setScale(PREVIEW_SCALE);
    this.previewHat = this.add.image(previewX, previewY, hatTextureKey(this.selection.hatIndex), 0).setScale(PREVIEW_SCALE);

    // ── 3개 선택 행 + 입장 버튼 — 먼저 실제 요소를 만들고, 그 바운즈를 재서 패널을 뒤에 그린다.
    // (BootScene/ResultScene 조작키 패널과 같은 방식 — 폰트 폴백으로 폭이 바뀌어도 안 밀린다.)
    const itemsTop = PREVIEW_PANEL_TOP + previewPanelH + 20;
    const rowY: Record<Category, number> = { body: itemsTop + 28, outfit: itemsTop + 74, hat: itemsTop + 120 };
    const confirmY = itemsTop + 170;
    const rowLabel: Record<Category, string> = { body: '몸', outfit: '옷', hat: '모자' };

    const itemsBounds: Phaser.GameObjects.Text[] = [];

    (['body', 'outfit', 'hat'] as Category[]).forEach((cat) => {
      const y = rowY[cat];
      const nameTag = this.add.text(width / 2 - 260, y, rowLabel[cat], {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT.capyGrayMid,
      });
      itemsBounds.push(nameTag);

      const leftBtn = this.add
        .text(width / 2 - 140, y, '<', { fontFamily: 'monospace', fontSize: '26px', color: UI_TEXT.accentAmber })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      leftBtn.on('pointerdown', () => this.cycle(cat, -1));
      itemsBounds.push(leftBtn);

      const rightBtn = this.add
        .text(width / 2 + 140, y, '>', { fontFamily: 'monospace', fontSize: '26px', color: UI_TEXT.accentAmber })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      rightBtn.on('pointerdown', () => this.cycle(cat, 1));
      itemsBounds.push(rightBtn);

      const label = this.add
        .text(width / 2, y, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.capyWhite })
        .setOrigin(0.5);
      this.rowTexts[cat] = label;
      itemsBounds.push(label);

      const focusMark = this.add.text(width / 2 - 200, y, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.accentAmber });
      this.rowFocusMarks[cat] = focusMark;
      itemsBounds.push(focusMark);

      const hitZone = this.add.zone(width / 2, y, 320, 34).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        this.focus = cat;
        this.refresh();
      });
    });

    const confirmBtn = this.add
      .text(width / 2, confirmY, '[ 입장 ]', { fontFamily: 'monospace', fontSize: '24px', color: UI_TEXT.accentAmber })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    confirmBtn.on('pointerdown', () => this.confirm());
    itemsBounds.push(confirmBtn);

    // 항목 3줄 + 입장 버튼을 감싸는 패널 — 만든 요소들의 실측 바운즈로 크기를 정한다.
    const maxRight = Math.max(...itemsBounds.map((t) => t.getBounds().right));
    const minLeft = Math.min(...itemsBounds.map((t) => t.getBounds().left));
    const minTop = Math.min(...itemsBounds.map((t) => t.getBounds().top));
    const maxBottom = Math.max(...itemsBounds.map((t) => t.getBounds().bottom));
    const itemsPanelGfx = this.add.graphics();
    drawPanel(
      itemsPanelGfx,
      minLeft - ITEMS_PANEL_PAD_X,
      minTop - ITEMS_PANEL_PAD_Y,
      maxRight - minLeft + ITEMS_PANEL_PAD_X * 2,
      maxBottom - minTop + ITEMS_PANEL_PAD_Y * 2
    );
    // 패널을 나중에 그리면 위에 덮이므로, 항목 요소들을 다시 앞으로 올린다(BootScene과 같은 처리).
    itemsBounds.forEach((t) => t.setDepth(1));
    itemsPanelGfx.setDepth(0);

    const hintY = Math.max(confirmY + 46, this.scale.height - 40);
    this.add
      .text(width / 2, hintY, '↑↓ 항목 선택 · ←→ 변경 · Enter/클릭 입장', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT.capyGrayMid,
        stroke: UI_TEXT.ink,
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.cycle(this.focus, -1));
    kb?.on('keydown-RIGHT', () => this.cycle(this.focus, 1));
    kb?.on('keydown-A', () => this.cycle(this.focus, -1));
    kb?.on('keydown-D', () => this.cycle(this.focus, 1));
    kb?.on('keydown-UP', () => this.moveFocus(-1));
    kb?.on('keydown-DOWN', () => this.moveFocus(1));
    kb?.on('keydown-W', () => this.moveFocus(-1));
    kb?.on('keydown-S', () => this.moveFocus(1));
    kb?.on('keydown-ENTER', () => this.confirm());
    kb?.on('keydown-SPACE', () => this.confirm());

    this.refresh();
  }

  private moveFocus(delta: number): void {
    const order: Category[] = ['body', 'outfit', 'hat'];
    const idx = order.indexOf(this.focus);
    this.focus = order[(idx + delta + order.length) % order.length];
    this.refresh();
  }

  private cycle(cat: Category, delta: number): void {
    if (cat === 'body') {
      this.selection.bodyIndex = (this.selection.bodyIndex + delta + BODY_NAMES.length) % BODY_NAMES.length;
    } else if (cat === 'outfit') {
      this.selection.outfitIndex = (this.selection.outfitIndex + delta + OUTFIT_NAMES.length) % OUTFIT_NAMES.length;
    } else {
      this.selection.hatIndex = (this.selection.hatIndex + delta + HAT_NAMES.length) % HAT_NAMES.length;
    }
    this.focus = cat;
    this.refresh();
  }

  private refresh(): void {
    this.previewBody.setTexture(bodyTextureKey(this.selection.bodyIndex), 0);
    this.previewOutfit.setTexture(outfitTextureKey(this.selection.outfitIndex), 0);
    this.previewHat.setTexture(hatTextureKey(this.selection.hatIndex), 0);

    this.rowTexts.body.setText(BODY_NAMES[this.selection.bodyIndex]);
    this.rowTexts.outfit.setText(OUTFIT_NAMES[this.selection.outfitIndex]);
    this.rowTexts.hat.setText(HAT_NAMES[this.selection.hatIndex]);

    (['body', 'outfit', 'hat'] as Category[]).forEach((cat) => {
      this.rowFocusMarks[cat].setText(cat === this.focus ? '▶' : '');
    });
  }

  private confirm(): void {
    this.registry.set(REGISTRY_SELECTION_KEY, { ...this.selection });
    bakeCompositeTexture(this, this.selection, PLAYER_TEXTURE_KEY);
    this.scene.start('GameScene');
  }
}
