import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

// front/src/index.css의 실제 토큰 값. 톤 교체(T1) 시 이 값도 함께 갱신해야 한다.
const light = {
  bg: "#fafafa",
  surface: "#ffffff",
  ink: "#0f0f0f",
  inkSoft: "#595959",
  stable: "#166e3d",
  stableBg: "#e7f7ee",
  caution: "#884e07",
  cautionBg: "#fdf2df",
  danger: "#b8261b",
  dangerBg: "#fdeceb",
  check: "#1554e0",
  checkBg: "#e8f0fe",
};

const dark = {
  bg: "#101010",
  surface: "#1a1a1a",
  ink: "#f5f5f5",
  inkSoft: "#b3b3b3",
  stable: "#45d07f",
  stableBg: "#14301f",
  caution: "#f7b733",
  cautionBg: "#3a2b0b",
  danger: "#ff6b5e",
  dangerBg: "#3c1714",
  check: "#5fa3f7",
  checkBg: "#15243b",
};

describe("contrastRatio", () => {
  it("computes known WCAG reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBe(contrastRatio("#000000", "#ffffff"));
  });
});

describe("light mode token contrast (AC3, AC4)", () => {
  it("keeps primary text >= 7:1 (AAA) against bg and surface", () => {
    expect(contrastRatio(light.bg, light.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(light.surface, light.ink)).toBeGreaterThanOrEqual(7);
  });

  it("keeps secondary text >= 4.5:1 (AA) against bg and surface", () => {
    expect(contrastRatio(light.bg, light.inkSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.surface, light.inkSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps status colors >= 4.5:1 against their own chip background (small text usage: RoomTile status word, RoomStatusBoard legend/count chips)", () => {
    expect(contrastRatio(light.stable, light.stableBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.caution, light.cautionBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.danger, light.dangerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.check, light.checkBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the solid stable button (AlertsPage 완료 처리, white text on bg-status-stable) >= 3:1 as a verified large-text (text-staff-btn, 21px/700) usage", () => {
    expect(contrastRatio("#ffffff", light.stable)).toBeGreaterThanOrEqual(3);
  });
});

describe("dark mode token contrast (AC3, AC4)", () => {
  it("keeps primary text >= 7:1 (AAA) against bg and surface", () => {
    expect(contrastRatio(dark.bg, dark.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(dark.surface, dark.ink)).toBeGreaterThanOrEqual(7);
  });

  it("keeps secondary text >= 4.5:1 (AA) against bg and surface", () => {
    expect(contrastRatio(dark.bg, dark.inkSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.surface, dark.inkSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps status colors >= 4.5:1 against their own chip background (small text usage)", () => {
    expect(contrastRatio(dark.stable, dark.stableBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.caution, dark.cautionBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.danger, dark.dangerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.check, dark.checkBg)).toBeGreaterThanOrEqual(4.5);
  });
});
