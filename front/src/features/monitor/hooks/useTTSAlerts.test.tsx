import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTTSAlerts } from "./useTTSAlerts";

class SpeechSynthesisUtteranceStub {
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_text: string) {}
}

describe("useTTSAlerts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("silences the real TTS manager when the monitor unmounts", () => {
    const cancel = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", SpeechSynthesisUtteranceStub);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        cancel,
        getVoices: vi.fn(() => []),
        speak: vi.fn(),
      },
    });
    vi.useFakeTimers();

    const { unmount } = renderHook(() =>
      useTTSAlerts(
        [{ spaceId: "space_alert", name: "101호", level: "DANGER", reason: "낙상 위험", floorName: "1층" }],
        true,
      ),
    );

    vi.advanceTimersByTime(1000);
    unmount();

    expect(cancel).toHaveBeenCalledOnce();
  });
});
