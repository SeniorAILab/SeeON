/**
 * 아침 승인용 현황판 스크린샷 캡처.
 *
 * 프로덕션에 접근하지 않고 로컬 dev 서버에서 두 상태를 찍는다.
 *   - mixed:    카메라 2대 LIVE / 5대 STALE (내일 아침 실제 구성, 2녹색 5회색)
 *   - all-live: 전부 LIVE (정상 상태 대조군)
 *
 * 사용: node visual/capture.mjs <출력디렉터리>
 */
// playwright는 프로젝트 의존성이 아니라 npx 캐시에 있다.
// PLAYWRIGHT_PACKAGE로 경로를 넘기면 그걸 쓴다.
const pwPath = process.env.PLAYWRIGHT_PACKAGE ?? "playwright";
const { chromium } = await import(pwPath);
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const outDir = resolve(process.argv[2] ?? "./visual-out");
const BASE = "http://localhost:5199/visual/monitor-states.html";

await mkdir(outDir, { recursive: true });

// 브라우저 바이너리는 PLAYWRIGHT_CHROMIUM으로 지정할 수 있다.
// (npx 캐시의 playwright 버전과 다운로드된 빌드가 어긋날 때 사용)
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
// TV 벽면 기준 해상도. 4m 가독성을 이 크기에서 판단한다.
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const results = [];

for (const mode of ["mixed", "all-live"]) {
  await page.goto(`${BASE}?mode=${mode}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="visual-root"]');
  await page.waitForSelector("[data-space-id]");

  const tiles = await page.$$eval("[data-space-id]", (nodes) =>
    nodes.map((n) => ({
      spaceId: n.getAttribute("data-space-id"),
      status: n.getAttribute("data-status"),
      connection: n.getAttribute("data-connection"),
      label: n.getAttribute("aria-label"),
    })),
  );

  const live = tiles.filter((t) => t.connection === "LIVE").length;
  const stale = tiles.filter((t) => t.connection === "STALE").length;
  const danger = tiles.filter((t) => t.status === "DANGER").length;

  const file = `${outDir}/monitor-${mode}.png`;
  await page.screenshot({ path: file, fullPage: false });

  results.push({ mode, file, total: tiles.length, live, stale, danger, tiles });
  console.log(`[${mode}] tiles=${tiles.length} live=${live} stale=${stale} danger=${danger} -> ${file}`);
}

await browser.close();

// 오라클: mixed 모드는 정확히 2 LIVE / 5 STALE 이어야 한다.
const mixed = results.find((r) => r.mode === "mixed");
if (mixed.live !== 2 || mixed.stale !== 5) {
  console.error(`ORACLE FAIL: expected 2 live / 5 stale, got ${mixed.live}/${mixed.stale}`);
  process.exit(1);
}
const allLive = results.find((r) => r.mode === "all-live");
if (allLive.stale !== 0) {
  console.error(`ORACLE FAIL: all-live expected 0 stale, got ${allLive.stale}`);
  process.exit(1);
}
console.log("ORACLE PASS: mixed=2 live/5 stale, all-live=0 stale");
