import Phaser from 'phaser';
import { UI_TEXT } from './palette';
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
 */

const BODY_NAMES = ['기본갈색', '연갈색', '회색', '흰색'];
const OUTFIT_NAMES = ['없음', '멜빵바지', '수건', '우비', '작업복'];
const HAT_NAMES = ['없음', '밀짚모자', '유자', '헬멧'];

/** 미리보기 확대 배율. 정수 스케일만(GDD 8장 — 픽셀아트 서브픽셀 금지). */
const PREVIEW_SCALE = 4;

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
    this.cameras.main.setBackgroundColor(UI_TEXT.ink);

    this.add
      .text(width / 2, 36, '카피바라 꾸미기', { fontFamily: 'monospace', fontSize: '28px', color: UI_TEXT.capyWhite })
      .setOrigin(0.5);

    // ── 미리보기(down, frame 0 고정) — 3레이어를 그대로 겹쳐 보여준다. 게임플레이 무영향(GDD 4장). ──
    const previewX = width / 2;
    const previewY = 190;
    this.previewBody = this.add.image(previewX, previewY, bodyTextureKey(this.selection.bodyIndex), 0).setScale(PREVIEW_SCALE);
    this.previewOutfit = this.add
      .image(previewX, previewY, outfitTextureKey(this.selection.outfitIndex), 0)
      .setScale(PREVIEW_SCALE);
    this.previewHat = this.add.image(previewX, previewY, hatTextureKey(this.selection.hatIndex), 0).setScale(PREVIEW_SCALE);

    // ── 3개 선택 행 ──
    const rowY: Record<Category, number> = { body: 340, outfit: 390, hat: 440 };
    const rowLabel: Record<Category, string> = { body: '몸', outfit: '옷', hat: '모자' };

    (['body', 'outfit', 'hat'] as Category[]).forEach((cat) => {
      const y = rowY[cat];
      this.add.text(width / 2 - 260, y, rowLabel[cat], { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.capyGrayMid });

      const leftBtn = this.add
        .text(width / 2 - 140, y, '<', { fontFamily: 'monospace', fontSize: '26px', color: UI_TEXT.accentAmber })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      leftBtn.on('pointerdown', () => this.cycle(cat, -1));

      const rightBtn = this.add
        .text(width / 2 + 140, y, '>', { fontFamily: 'monospace', fontSize: '26px', color: UI_TEXT.accentAmber })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      rightBtn.on('pointerdown', () => this.cycle(cat, 1));

      const label = this.add
        .text(width / 2, y, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.capyWhite })
        .setOrigin(0.5);
      this.rowTexts[cat] = label;

      const focusMark = this.add.text(width / 2 - 200, y, '', { fontFamily: 'monospace', fontSize: '18px', color: UI_TEXT.accentAmber });
      this.rowFocusMarks[cat] = focusMark;

      const hitZone = this.add.zone(width / 2, y, 320, 34).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        this.focus = cat;
        this.refresh();
      });
    });

    const confirmBtn = this.add
      .text(width / 2, 540, '[ 입장 ]', { fontFamily: 'monospace', fontSize: '24px', color: UI_TEXT.accentAmber })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    confirmBtn.on('pointerdown', () => this.confirm());

    this.add
      .text(width / 2, 585, '↑↓ 항목 선택 · ←→ 변경 · Enter/클릭 입장', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT.capyGrayMid,
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
