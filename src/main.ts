import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CustomizeScene } from './scenes/CustomizeScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

/**
 * 게임 부팅 진입점.
 * 화면 크기(960×640)는 렌더 캔버스 좌표이지 밸런스 수치가 아니다 — balance.ts 대상이 아니다.
 * 32px 타일 그리드와 정수 배로 맞아떨어지도록 골랐을 뿐(30×20타일), 판정에는 쓰이지 않는다.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  pixelArt: true,
  roundPixels: true,
  scene: [BootScene, CustomizeScene, GameScene, ResultScene],
};

new Phaser.Game(config);
