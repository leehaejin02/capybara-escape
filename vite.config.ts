import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 개발 서버 전용 스크린샷 저장 엔드포인트.
 *
 * 왜 필요한가: 제출물 3·4번 PDF에 들어갈 스크린샷을 잡아야 하는데, 브라우저 자동화로
 * 찍으면 (a) 캔버스 바깥 페이지 배경까지 딸려 오고 (b) 리전 크롭이 뷰포트 경계에서
 * 어긋난다. 캔버스에서 직접 `toDataURL()`로 뽑으면 **정확히 960×640 원본 픽셀**이
 * 나오므로, 그 결과를 여기로 POST해서 `docs/screenshots/`에 저장한다.
 *
 * `apply: 'serve'`라 **`vite build` 산출물에는 존재하지 않는다.** 배포본에는 이 경로가 없다.
 */
function screenshotSaverPlugin(): Plugin {
  return {
    name: 'capybara-screenshot-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            // 경로 조작 차단 — 파일명은 A~E 라벨과 확장자만 허용한다.
            if (!/^[A-Za-z0-9_-]+\.png$/.test(name)) throw new Error(`잘못된 파일명: ${name}`);
            const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
            const dir = join(process.cwd(), 'docs', 'screenshots');
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
            res.statusCode = 200;
            res.end(`saved docs/screenshots/${name}`);
          } catch (e) {
            res.statusCode = 400;
            res.end(`failed: ${(e as Error).message}`);
          }
        });
      });
    },
  };
}

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
  plugins: [screenshotSaverPlugin()],
  define: {
    __ASSET_VERSION__: JSON.stringify(command === 'build' ? Date.now().toString(36) : 'dev'),
  },
}));
