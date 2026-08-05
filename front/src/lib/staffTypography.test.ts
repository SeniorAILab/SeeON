import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H1/H2: TV 벽면 2~4m 가독성.
 *
 * 요양보호사가 상시 띄워둔 화면을 지나가며 읽는다. 상태 24px / 설명 19px는
 * 4m에서 판독이 안 됐다. 값이 다시 내려가면 조용히 안 보이게 되므로 하한을
 * 테스트로 고정한다.
 */
// vitest는 front 패키지 루트에서 실행된다.
const configSource = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");

/** `"staff-status": ["2rem", { ... }]` 형태에서 rem 값을 뽑아 px로 돌려준다. */
function px(token: string): number {
  const match = new RegExp(`"${token}":\\s*\\["([0-9.]+)rem"`).exec(configSource);
  if (!match) throw new Error(`tailwind.config.js에 ${token} 스케일이 없다`);
  return Number.parseFloat(match[1]) * 16;
}

function hasLineHeight(token: string): boolean {
  const match = new RegExp(`"${token}":\\s*\\[[^\\]]*lineHeight`).exec(configSource);
  return match !== null;
}

describe("직원용 타이포 스케일 하한", () => {
  it("상태 텍스트는 32px 이상이다", () => {
    expect(px("staff-status")).toBeGreaterThanOrEqual(32);
  });

  it("설명 텍스트는 24px 이상이다", () => {
    expect(px("staff-body")).toBeGreaterThanOrEqual(24);
  });

  it("공간명은 상태보다 크다", () => {
    expect(px("staff-name")).toBeGreaterThan(px("staff-status"));
  });

  it("버튼 텍스트는 24px 이상이다", () => {
    // 50-60대 터치 대상. 44px 최소 터치 타깃과 함께 읽힌다.
    expect(px("staff-btn")).toBeGreaterThanOrEqual(24);
  });

  it("모든 스케일에 lineHeight가 지정되어 줄바꿈이 뭉개지지 않는다", () => {
    for (const token of ["staff-name", "staff-status", "staff-body", "staff-btn"]) {
      expect(hasLineHeight(token)).toBe(true);
    }
  });
});
