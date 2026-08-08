import { defineConfig } from 'vite';

/*
 * `public/assets/*.png`는 Vite가 해시를 붙이지 않고 파일명 그대로 복사한다.
 * 그래서 파일 내용이 바뀌어도 URL이 그대로라, **한 번이라도 방문한 브라우저는
 * 하드 리프레시 전까지 옛 그림을 계속 본다.**
 *
 * 실측(2026-08-08): 아트 16종을 교체해 배포한 직후에도 브라우저가 서버에 묻지 않고
 * `transfer: 0`으로 923바이트짜리 옛 `capy_body_01.png`를 그대로 썼다.
 * 서버 파일은 3,430바이트였다.
 *
 * 이건 미관 문제가 아니라 **제출물 2번(플레이 영상)을 직접 위협한다** — 촬영자가
 * 하드 리프레시를 잊으면 옛 아트로 녹화된다. 그래서 빌드마다 바뀌는 값을 쿼리로 붙여
 * 브라우저가 반드시 새로 받게 한다(`BootScene`이 이 값을 읽는다).
 *
 * 빌드 시각을 쓰는 이유: 수동 상수는 누군가 올리는 것을 잊는다. 에셋 총량이 작아
 * (로고 제외 23장 합계 약 30KB) 매 빌드 재다운로드 비용이 무시할 만하다.
 * dev 서버에서는 Vite가 알아서 갱신하므로 고정값을 쓴다.
 */
// `command`로 판별한다. `process.env.NODE_ENV`는 Vite가 내부에서 설정하는 값이라
// 겉보기엔 동작하지만 조용히 뒤집힐 수 있다 — 그러면 캐시 무효화가 소리 없이 꺼진다.
export default defineConfig(({ command }) => ({
  base: '/capybara-escape/',
  define: {
    __ASSET_VERSION__: JSON.stringify(command === 'build' ? Date.now().toString(36) : 'dev'),
  },
}));
