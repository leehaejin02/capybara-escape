import Phaser from 'phaser';

/**
 * BootScene — 타이틀 텍스트 1개만 그린다.
 *
 * 이 씬은 렌더링만 한다. 게임 규칙 판정은 여기서 하지 않는다 (CLAUDE.md 아키텍처 3).
 * CustomizeScene / GameScene / ResultScene은 이번 스캐폴딩 범위가 아니다 (DECISIONS D6).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'Capybara Escape', {
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
