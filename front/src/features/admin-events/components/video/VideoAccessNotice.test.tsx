import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoAccessNotice } from "@/features/admin-events/components/video/VideoAccessNotice";

describe("VideoAccessNotice", () => {
  it("keeps Korean words intact when the privacy notice wraps", () => {
    render(<VideoAccessNotice />);

    const emphasis = screen.getByText("이벤트 구간만");
    const notice = emphasis.closest("div");

    expect(notice?.classList.contains("break-keep")).toBe(true);
  });
});
