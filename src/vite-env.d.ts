/// <reference types="vite/client" />

/**
 * 빌드마다 바뀌는 에셋 캐시 무효화 토큰. `vite.config.ts`의 `define`이 주입한다.
 * `public/assets/*.png`는 파일명에 해시가 없어서, 이 값을 쿼리로 붙이지 않으면
 * 이미 방문한 브라우저가 옛 그림을 계속 쓴다(2026-08-08 실측).
 */
declare const __ASSET_VERSION__: string;
