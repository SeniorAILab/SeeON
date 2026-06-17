import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCrud } from "./useCrud";
import { api } from "./api";

vi.mock("./api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockApi = api as unknown as Record<string, any>;

describe("useCrud", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads items on mount", async () => {
    mockApi.get.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    const { result } = renderHook(() => useCrud("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(2);
    expect(mockApi.get).toHaveBeenCalledWith("/api/x");
  });

  it("create posts to the endpoint and reloads", async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockResolvedValue({ id: "9" });
    const { result } = renderHook(() => useCrud("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create({ name: "a" });
    });
    expect(ok).toBe(true);
    expect(mockApi.post).toHaveBeenCalledWith("/api/x", { name: "a" });
    expect(mockApi.get).toHaveBeenCalledTimes(2); // initial + reload
  });

  it("save patches the endpoint, clears editId, and reloads", async () => {
    mockApi.get.mockResolvedValue([{ id: "1" }]);
    mockApi.patch.mockResolvedValue({ id: "1" });
    const { result } = renderHook(() => useCrud("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.startEdit("1"));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.save("1", { name: "b" });
    });
    expect(ok).toBe(true);
    expect(mockApi.patch).toHaveBeenCalledWith("/api/x/1", { name: "b" });
    expect(result.current.editId).toBeNull();
    expect(mockApi.get).toHaveBeenCalledTimes(2); // initial + reload
  });

  it("save keeps the edit row open and surfaces editError on failure", async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.patch.mockRejectedValue(new Error("conflict"));
    const { result } = renderHook(() => useCrud("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.startEdit("1"));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.save("1", {});
    });
    expect(ok).toBe(false);
    expect(result.current.editError).toBe("conflict");
    expect(result.current.editId).toBe("1"); // stays open on failure
  });

  it("remove deletes by id and drops the row optimistically", async () => {
    mockApi.get.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    mockApi.delete.mockResolvedValue({});
    const { result } = renderHook(() => useCrud<{ id: string }>("/api/x"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(async () => {
      await result.current.remove("1");
    });
    expect(mockApi.delete).toHaveBeenCalledWith("/api/x/1");
    expect(result.current.items.map((i) => i.id)).toEqual(["2"]);
  });

  it("surfaces the create error message", async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCrud("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create({});
    });
    expect(ok).toBe(false);
    expect(result.current.createError).toBe("boom");
  });
});
