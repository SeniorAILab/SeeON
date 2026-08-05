import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SoundToggle } from "./SoundToggle";
import {
  __setTTSFailureForTest,
  clearTTSFailure,
  getTTSFailureReason,
  ttsManager,
} from "@/features/monitor/services/tts/ttsManager";
import { getTTSProvider } from "@/features/monitor/services/tts/ttsProvider";

/**
 * D2: 음성 안내 실패를 사용자에게 알린다.
 *
 * 예전에는 ttsProvider가 onerror에서도 resolve()해 실패를 삼켰다. TV를
 * 켜두기만 하면 autoplay 정책이 첫 발화를 막는데, 화면은 "음성 안내 켜짐"
 * 이라고 말하고 낙상이 나도 소리가 나지 않았다.
 */
describe("SoundToggle — 음성 실패 안내", () => {
  beforeEach(() => {
    clearTTSFailure();
    vi.restoreAllMocks();
  });

  it("정상 상태에서는 경고를 띄우지 않는다", () => {
    render(<SoundToggle enabled onToggle={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("발화가 차단되면 화면을 누르라고 안내한다", async () => {
    __setTTSFailureForTest("blocked");

    render(<SoundToggle enabled onToggle={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("소리를 켜려면 화면을 한 번 눌러 주세요.");
  });

  it("미지원 브라우저와 엔진 오류는 각각 다른 문구를 낸다", async () => {
    __setTTSFailureForTest("unsupported");
    const { rerender } = render(<SoundToggle enabled onToggle={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "이 브라우저는 음성 안내를 지원하지 않습니다."
    );

    await act(async () => {
      __setTTSFailureForTest("engine");
    });
    rerender(<SoundToggle enabled onToggle={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "음성 안내를 재생하지 못했습니다. 소리를 다시 켜 주세요."
    );
  });

  it("토글을 누르면 실패 상태가 초기화되어 재시도 기회가 생긴다", async () => {
    __setTTSFailureForTest("blocked");
    const onToggle = vi.fn();
    render(<SoundToggle enabled onToggle={onToggle} />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /음성 안내/ }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(getTTSFailureReason()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("소리가 꺼져 있으면 실패 안내를 띄우지 않는다", async () => {
    __setTTSFailureForTest("blocked");
    render(<SoundToggle enabled={false} onToggle={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("manager가 실제 발화 실패를 관측하면 실패 상태가 기록된다", async () => {
    // provider가 autoplay 차단으로 거부하는 실제 경로를 재현한다.
    vi.spyOn(getTTSProvider(), "speak").mockResolvedValue({
      ok: false,
      reason: "blocked",
    });
    vi.useFakeTimers();

    render(<SoundToggle enabled onToggle={() => {}} />);

    await act(async () => {
      ttsManager.update(
        [
          {
            spaceId: "sp_205",
            name: "205호",
            level: "DANGER",
            reason: "낙상 감지",
            floorName: "2F",
          },
        ],
        true
      );
      // tick()은 1초 인터벌이다.
      await vi.advanceTimersByTimeAsync(1_100);
    });

    expect(getTTSFailureReason()).toBe("blocked");

    vi.useRealTimers();
    ttsManager.update([], false);
  });
});
