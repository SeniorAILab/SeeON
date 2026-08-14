export interface Paginated<T> {
  readonly items: T[];
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
}

export type PageWindowItem = number | "ellipsis";

export function pageFromSearchParams(searchParams: URLSearchParams): number {
  const raw = searchParams.get("page");
  if (raw === null) return 1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Paginated<T> {
  if (pageSize <= 0) {
    throw new Error("pageSize must be greater than 0");
  }
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const requested = Number.isInteger(page) && page >= 1 ? page : 1;
  const clamped = totalPages === 0 ? 1 : Math.min(requested, totalPages);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    totalPages,
    total,
  };
}

export function pageWindow(
  current: number,
  totalPages: number,
  siblingCount: number,
): PageWindowItem[] {
  if (siblingCount < 0) {
    throw new Error("siblingCount must be >= 0");
  }
  if (totalPages < 0) {
    throw new Error("totalPages must be >= 0");
  }
  if (totalPages === 0) return [];
  if (!Number.isInteger(current) || current < 1 || current > totalPages) {
    throw new Error("current must be an integer between 1 and totalPages");
  }

  const start = Math.max(1, current - siblingCount);
  const end = Math.min(totalPages, current + siblingCount);
  const items: PageWindowItem[] = [];

  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }
  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) items.push("ellipsis");
    items.push(totalPages);
  }
  return items;
}
