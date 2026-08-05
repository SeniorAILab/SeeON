import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("FullscreenButton — wake-lock", () => {
  const originalWakeLock = Object.getOwnPropertyDescriptor(navigator, "wakeLock");

  afterEach(() => {
    if (originalWakeLock) {
      Object.defineProperty(navigator, "wakeLock", originalWakeLock);
    } else {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }
  });

  function stubWakeLock() {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
      writable: true,
    });
    return { request, release };
  }

  it("마운트 시 화면 Wake Lock을 요청한다", async () => {
    const { request } = stubWakeLock();
    const ref = { current: document.createElement("div") };

    render(<FullscreenButton targetRef={ref} />);

    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("언마운트 시 Wake Lock을 해제한다", async () => {
    const { request, release } = stubWakeLock();
    const ref = { current: document.createElement("div") };

    const { unmount } = render(<FullscreenButton targetRef={ref} />);
    await waitFor(() => expect(request).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it("미지원 브라우저에서는 조용히 무시하고 버튼은 그대로 동작한다", () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    const ref = { current: document.createElement("div") };

    expect(() => render(<FullscreenButton targetRef={ref} />)).not.toThrow();
    expect(screen.getByRole("button", { name: /전체 화면/ })).not.toBeNull();
  });

  it("Wake Lock 요청이 거부돼도 현황판 렌더링을 막지 않는다", async () => {
    const request = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
      writable: true,
    });
    const ref = { current: document.createElement("div") };

    render(<FullscreenButton targetRef={ref} />);

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /전체 화면/ })).not.toBeNull();
  });
});
