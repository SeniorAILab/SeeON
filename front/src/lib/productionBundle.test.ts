import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `front/visual/`은 아침 승인 스크린샷을 만드는 개발 전용 하니스다.
 * 프로덕션 번들에 들어가면 쓰이지 않는 코드가 요양원 서버로 나간다.
 *
 * vite는 `index.html` 하나만 엔트리로 잡으므로 현재는 포함되지 않는다.
 * 누군가 rollupOptions.input에 하니스를 추가하거나 앱 코드에서 import하면
 * 조용히 들어오므로 여기서 막는다.
 *
 * `dist/`가 없으면(빌드 전) 이 검사는 건너뛴다 — CI는 build 후 test를 돌린다.
 */
describe("프로덕션 번들 경계", () => {
  const distDir = resolve(process.cwd(), "dist");

  it("앱 소스가 시각 검증 하니스를 import하지 않는다", () => {
    // 소스 레벨에서 막으면 빌드 여부와 무관하게 항상 검출된다.
    const srcDir = resolve(process.cwd(), "src");
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (entry.name.endsWith("productionBundle.test.ts")) continue;
        const text = readFileSync(full, "utf8");
        if (/from\s+["'][^"']*\/visual\//.test(text)) offenders.push(full);
      }
    }

    walk(srcDir);
    expect(offenders).toEqual([]);
  });

  it("빌드 산출물에 하니스 흔적이 없다", () => {
    if (!existsSync(distDir)) return;

    const assets = resolve(distDir, "assets");
    const bundled = existsSync(assets)
      ? readdirSync(assets)
          .filter((name) => name.endsWith(".js"))
          .map((name) => readFileSync(resolve(assets, name), "utf8"))
          .join("\n")
      : "";

    expect(bundled).not.toContain("visual-root");
    expect(bundled).not.toContain("monitor-states");
    expect(existsSync(resolve(distDir, "visual"))).toBe(false);
  });
});
