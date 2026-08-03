import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";
import { useMonitorSettingsStore } from "@/features/monitor/stores/monitorSettingsStore";

/**
 * I5: 소리 알림 SSOT.
 *
 * 예전에는 `uiStore.soundEnabled`(기본 켜짐)와
 * `monitorSettingsStore.alertSound`(기본 꺼짐)가 따로 존재했다. StaffLayout
 * 헤더는 앞의 것을 토글하고 실제 TTS는 뒤의 것을 읽어서, 화면은 "소리 알림
 * 켜짐"이라고 말하는데 낙상이 나도 소리가 안 났다.
 */
describe("소리 알림 SSOT", () => {
  beforeEach(() => {
    localStorage.clear();
    useMonitorSettingsStore.getState().update({ alertSound: true });
  });

  it("uiStore는 더 이상 소리 상태를 들고 있지 않다", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect("soundEnabled" in state).toBe(false);
    expect("toggleSound" in state).toBe(false);
  });

  it("uiStore는 테마만 소유한다", () => {
    const keys = Object.keys(useUiStore.getState()).sort();
    expect(keys).toEqual(["setTheme", "theme", "toggleTheme"]);
  });

  it("소리 알림 기본값은 켜짐이다", () => {
    localStorage.clear();
    // DEFAULTS를 직접 검증한다(스토어는 모듈 로드 시 1회 load()한다).
    useMonitorSettingsStore.getState().reset();
    expect(useMonitorSettingsStore.getState().alertSound).toBe(true);
  });

  it("소리를 끄면 단일 상태만 바뀌고 다시 켜면 복귀한다", () => {
    useMonitorSettingsStore.getState().update({ alertSound: false });
    expect(useMonitorSettingsStore.getState().alertSound).toBe(false);

    useMonitorSettingsStore.getState().update({ alertSound: true });
    expect(useMonitorSettingsStore.getState().alertSound).toBe(true);
  });

  it("테마 토글은 소리 상태에 영향을 주지 않는다", () => {
    useMonitorSettingsStore.getState().update({ alertSound: false });
    useUiStore.getState().toggleTheme();
    expect(useMonitorSettingsStore.getState().alertSound).toBe(false);
  });
});
