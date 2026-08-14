import { describe, expect, it } from "vitest";
import { pageFromSearchParams, paginate, pageWindow } from "./paginate";

describe("pageFromSearchParams", () => {
  it("defaults to 1 when page is absent", () => {
    expect(pageFromSearchParams(new URLSearchParams())).toBe(1);
  });

  it("reads a positive integer page", () => {
    expect(pageFromSearchParams(new URLSearchParams("page=3"))).toBe(3);
  });

  it("falls back to 1 for invalid values", () => {
    expect(pageFromSearchParams(new URLSearchParams("page=abc"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams("page=0"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams("page=-2"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams("page=2.5"))).toBe(1);
  });
});

describe("paginate", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("slices the requested page", () => {
    expect(paginate(items, 1, 2)).toEqual({
      items: ["a", "b"],
      page: 1,
      totalPages: 3,
      total: 5,
    });
    expect(paginate(items, 3, 2)).toEqual({
      items: ["e"],
      page: 3,
      totalPages: 3,
      total: 5,
    });
  });

  it("clamps an oversized page to the last page", () => {
    expect(paginate(items, 99, 2)).toEqual({
      items: ["e"],
      page: 3,
      totalPages: 3,
      total: 5,
    });
  });

  it("treats a non-positive page as 1", () => {
    expect(paginate(items, 0, 2).page).toBe(1);
    expect(paginate(items, 0, 2).items).toEqual(["a", "b"]);
  });

  it("returns an empty page when there are no items", () => {
    expect(paginate([], 4, 20)).toEqual({
      items: [],
      page: 1,
      totalPages: 0,
      total: 0,
    });
  });

  it("rejects a non-positive page size", () => {
    expect(() => paginate(items, 1, 0)).toThrow("pageSize must be greater than 0");
  });
});

describe("pageWindow", () => {
  it("returns a single page without ellipsis", () => {
    expect(pageWindow(1, 1, 1)).toEqual([1]);
  });

  it("returns all pages when they fit next to the current page", () => {
    expect(pageWindow(3, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("windows a long range around the current page", () => {
    expect(pageWindow(5, 12, 1)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 12]);
    expect(pageWindow(1, 12, 1)).toEqual([1, 2, "ellipsis", 12]);
    expect(pageWindow(12, 12, 1)).toEqual([1, "ellipsis", 11, 12]);
  });

  it("returns an empty window when there are no pages", () => {
    expect(pageWindow(1, 0, 1)).toEqual([]);
  });

  it("rejects an out-of-range current page when pages exist", () => {
    expect(() => pageWindow(0, 3, 1)).toThrow(
      "current must be an integer between 1 and totalPages",
    );
  });
});
