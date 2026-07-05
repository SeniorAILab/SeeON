import { describe, expect, it } from "vitest";
import { computeGridSpec } from "./gridSpec";

const CONTAINER_WIDTH = 1600;
const CONTAINER_HEIGHT = 900;

function occupiedUnits(cellCount: number, heroCount: number, heroSpan: 1 | 2): number {
  const normalCount = cellCount - heroCount;
  return normalCount * 1 + heroCount * heroSpan * heroSpan;
}

function expectStructurallySound(cellCount: number, heroCount: number, width = CONTAINER_WIDTH, height = CONTAINER_HEIGHT) {
  const spec = computeGridSpec(cellCount, heroCount, width, height);
  const units = occupiedUnits(cellCount, heroCount, spec.heroSpan);
  // ① 겹침 불가능 — 그리드 전체 유닛 수는 점유 유닛 총합 이상이어야 한다.
  expect(spec.rows * spec.cols).toBeGreaterThanOrEqual(units);
  // ② heroSpan은 항상 그리드 치수 이내여야 한다 (heroSpan=2는 cols>=2 && rows>=2일 때만).
  expect(spec.heroSpan).toBeLessThanOrEqual(Math.min(spec.cols, spec.rows));
  return spec;
}

describe("computeGridSpec invariants", () => {
  it("N=1, hero=0: single tile fills a 1x1 grid without needing a hero span", () => {
    const spec = expectStructurallySound(1, 0);
    expect(spec.heroSpan).toBe(1);
  });

  it("N=14, hero=0: no hero present, heroSpan stays 1", () => {
    const spec = expectStructurallySound(14, 0);
    expect(spec.heroSpan).toBe(1);
  });

  it("N=14, hero=1: a single emergency room is enlarged (heroSpan=2)", () => {
    const spec = expectStructurallySound(14, 1);
    expect(spec.heroSpan).toBe(2);
    expect(spec.cols).toBeGreaterThanOrEqual(2);
    expect(spec.rows).toBeGreaterThanOrEqual(2);
  });

  it("N=14, hero=3: several simultaneous emergencies still enlarge (heroSpan=2)", () => {
    const spec = expectStructurallySound(14, 3);
    expect(spec.heroSpan).toBe(2);
  });

  it("N=14, hero=14: every room emergency — hero ratio threshold degrades heroSpan to 1", () => {
    const spec = expectStructurallySound(14, 14);
    expect(spec.heroSpan).toBe(1);
  });

  it("N=30 (extreme count), hero=3: invariants hold even with many rooms", () => {
    expectStructurallySound(30, 3);
  });

  it("N=30, hero=0: invariants hold with no hero present", () => {
    const spec = expectStructurallySound(30, 0);
    expect(spec.heroSpan).toBe(1);
  });

  it("degrades heroSpan to 1 when the hero-sized cell would be unreadably small (min-height rule)", () => {
    // 매우 낮은 컨테이너 높이: heroSpan=2로 계산한 행 높이가 최소 가독 높이 미만이 되어야 한다.
    const spec = expectStructurallySound(20, 2, CONTAINER_WIDTH, 120);
    expect(spec.heroSpan).toBe(1);
  });

  it("degrades heroSpan to 1 when the geometric precondition (cols>=2 && rows>=2) fails", () => {
    // 극단적으로 좁고 긴 컨테이너: heroSpan=2 후보의 열이 1로 떨어져 기하 전제조건만 단독으로 실패해야 한다
    // (hero 비율·최소 높이 규칙은 통과하도록 hero 비율<50%, 실제 셀 높이는 충분히 크게 잡음).
    const spec = expectStructurallySound(6, 1, 100, 2000);
    expect(spec.heroSpan).toBe(1);
  });

  it("N=4~8 (low room-count floor): grid fills the container tightly, at most one cell of waste", () => {
    // 사용자 피드백: 방 수가 적은 층(예: fl_3f)에서 타일이 "바둑알"처럼 작게 뭉치면 안 된다.
    // rows*cols는 실제 셀 수를 바짝 따라가야 한다 — 낭비 칸은 최대 1개(마지막 행 일부만 비는 정도).
    for (const n of [4, 5, 6, 7, 8]) {
      const spec = expectStructurallySound(n, 0);
      const waste = spec.cols * spec.rows - n;
      expect(waste).toBeLessThanOrEqual(1);
    }
  });

  it("N=6, hero=0: matches the reported low-count case exactly (cols*rows <= N + cols)", () => {
    const spec = expectStructurallySound(6, 0);
    expect(spec.cols * spec.rows).toBeLessThanOrEqual(6 + spec.cols);
  });

  it("is idempotent for a given input (no randomness, no observable side effects)", () => {
    const first = computeGridSpec(14, 3, CONTAINER_WIDTH, CONTAINER_HEIGHT);
    const second = computeGridSpec(14, 3, CONTAINER_WIDTH, CONTAINER_HEIGHT);
    expect(second).toEqual(first);
  });

  it("never crashes on an unmeasured (zero-size) container", () => {
    const spec = expectStructurallySound(14, 1, 0, 0);
    expect(spec.cols).toBeGreaterThan(0);
    expect(spec.rows).toBeGreaterThan(0);
  });
});
