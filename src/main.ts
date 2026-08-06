import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

/**
 * 게임 부팅 진입점.
 * 화면 크기(800×600)는 렌더 캔버스 좌표이지 밸런스 수치가 아니다 — balance.ts 대상이 아니다.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
  pixelArt: true,
  roundPixels: true,
  scene: [BootScene],
};

new Phaser.Game(config);
