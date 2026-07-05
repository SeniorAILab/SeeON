import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FullscreenButton } from "./FullscreenButton";

describe("FullscreenButton", () => {
  it("surfaces an inline error when fullscreen request is rejected", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });

    const target = document.createElement("div");
    target.requestFullscreen = vi.fn(async () => {
      throw new Error("fullscreen unavailable");
    });

    render(<FullscreenButton targetRef={{ current: target }} />);

    fireEvent.click(screen.getByRole("button", { name: "전체 화면" }));

    await waitFor(() => expect(screen.queryByText("전체 화면을 사용할 수 없습니다")).toBeTruthy());
    expect(target.requestFullscreen).toHaveBeenCalled();
  });
});
