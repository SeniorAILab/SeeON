import { describe, expect, it } from "vitest";

import { isEventClipsEnabled } from "./eventClipFeature";

describe("event clip feature flag", () => {
  it("is disabled when the deployment does not opt in", () => {
    expect(isEventClipsEnabled(undefined)).toBe(false);
    expect(isEventClipsEnabled("false")).toBe(false);
  });

  it("enables only the explicit true deployment value", () => {
    expect(isEventClipsEnabled("true")).toBe(true);
  });
});
