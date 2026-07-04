export interface GridSpec {
  cols: number;
  rows: number;
  heroSpan: 1 | 2;
}

// 응급(hero) 타일이 2x2로 커졌을 때 방이름·상태어가 클리핑 없이 들어갈 최소 셀 높이(px).
// front/tailwind.config.js의 실제 타입 스케일에서 도출: staff-name lineHeight(2.1rem)
// + staff-status lineHeight(1.9rem) + 타일의 p-5 padding(위+아래 2 * 1.25rem) = 6.5rem.
const MIN_HERO_CELL_HEIGHT_PX = 16 * (2.1 + 1.9 + 2 * 1.25);

// hero가 전체 셀의 절반 이상을 차지하면 "확대"가 더 이상 의미 있는 신호가 아니다.
const HERO_RATIO_DEGRADE_THRESHOLD = 0.5;

function occupiedUnits(cellCount: number, heroCount: number, heroSpan: 1 | 2): number {
  const normalCount = cellCount - heroCount;
  return normalCount * 1 + heroCount * heroSpan * heroSpan;
}

// 컨테이너 종횡비와 총 유닛 수로부터 열/행 수를 계산한다. 이상적인(근사 정사각) 열 수
// 주변의 정수 두 개만 후보로 비교해 빈 칸(waste)이 더 적은 쪽을 우선 채택하고,
// waste가 같으면 더 정사각에 가까운 쪽을 고른다 — 그래야 방 수가 적은 층에서도
// 그리드 마지막 행에 큰 빈 공간이 남지 않고 화면을 실제로 채운다.
function squareish(units: number, aspect: number): { cols: number; rows: number } {
  const safeUnits = Math.max(1, Math.round(units));
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const idealCols = Math.sqrt(safeUnits * safeAspect);
  const clampCols = (n: number) => Math.max(1, Math.min(safeUnits, n));
  const candidateCols = new Set([clampCols(Math.floor(idealCols)), clampCols(Math.ceil(idealCols))]);

  let best = { cols: 1, rows: safeUnits, waste: Infinity, distance: Infinity };
  for (const cols of candidateCols) {
    const rows = Math.ceil(safeUnits / cols);
    const waste = cols * rows - safeUnits;
    const distance = Math.abs(cols - idealCols);
    if (waste < best.waste || (waste === best.waste && distance < best.distance)) {
      best = { cols, rows, waste, distance };
    }
  }
  return { cols: best.cols, rows: best.rows };
}

/**
 * 셀 수·응급(hero) 수·컨테이너 크기로부터 무겹침·무스크롤을 구조적으로 보장하는
 * 그리드 치수를 계산한다. heroSpan은 전역 이진 스위치(2 또는 1)로,
 * 아래 세 강등 규칙 중 하나라도 참이면 1로 강등된다.
 */
export function computeGridSpec(
  cellCount: number,
  heroCount: number,
  containerWidth: number,
  containerHeight: number,
): GridSpec {
  const safeCellCount = Math.max(0, Math.floor(cellCount));
  if (safeCellCount === 0) return { cols: 1, rows: 1, heroSpan: 1 };

  const safeHeroCount = Math.min(Math.max(0, Math.floor(heroCount)), safeCellCount);
  const aspect = containerWidth > 0 && containerHeight > 0 ? containerWidth / containerHeight : 1;

  if (safeHeroCount === 0) {
    const { cols, rows } = squareish(occupiedUnits(safeCellCount, 0, 1), aspect);
    return { cols, rows, heroSpan: 1 };
  }

  const candidate = squareish(occupiedUnits(safeCellCount, safeHeroCount, 2), aspect);

  // 규칙 1(기하 전제조건) — 먼저 확인: heroSpan=2는 cols>=2 && rows>=2일 때만 성립 가능.
  const failsGeometricPrecondition = candidate.cols < 2 || candidate.rows < 2;
  const cellHeightPx = containerHeight > 0 ? containerHeight / candidate.rows : Infinity;
  const failsMinReadableHeight = cellHeightPx < MIN_HERO_CELL_HEIGHT_PX;
  const failsHeroRatio = safeHeroCount >= safeCellCount * HERO_RATIO_DEGRADE_THRESHOLD;

  if (failsGeometricPrecondition || failsMinReadableHeight || failsHeroRatio) {
    const { cols, rows } = squareish(occupiedUnits(safeCellCount, safeHeroCount, 1), aspect);
    return { cols, rows, heroSpan: 1 };
  }

  return { cols: candidate.cols, rows: candidate.rows, heroSpan: 2 };
}
