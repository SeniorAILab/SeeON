import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatsBar } from "./StatsBar";
import type { DashboardSummary } from "@/types";

const summary: DashboardSummary = {
  totalSpaces: 8,
  stable: 4,
  caution: 2,
  danger: 1,
  checkNeeded: 1,
  unacknowledged: 3,
};

describe("StatsBar", () => {
  it("opens unacknowledged events through an accessible native button", () => {
    const onFilter = vi.fn();
    const onUnacknowledgedClick = vi.fn();
    render(
      <StatsBar
        summary={summary}
        activeFilter="ALL"
        onFilter={onFilter}
        onUnacknowledgedClick={onUnacknowledgedClick}
      />
    );

    const unacknowledgedButton = screen.getByRole("button", { name: "미확인 이벤트 3건 보기" });
    expect(unacknowledgedButton.getAttribute("disabled")).toBeNull();
    fireEvent.click(unacknowledgedButton);
    fireEvent.keyDown(unacknowledgedButton, { key: "Enter" });
    fireEvent.click(unacknowledgedButton);

    expect(unacknowledgedButton.tagName).toBe("BUTTON");
    expect(onUnacknowledgedClick).toHaveBeenCalledTimes(2);
    expect(onFilter).not.toHaveBeenCalled();
  });

  it("renders a zero-count unacknowledged metric without a dead button", () => {
    render(
      <StatsBar
        summary={{ ...summary, unacknowledged: 0 }}
        activeFilter="ALL"
        onFilter={vi.fn()}
        onUnacknowledgedClick={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /미확인 이벤트/ })).toBeNull();
    expect(screen.getByText("미확인 이벤트")).toBeTruthy();
  });

  it("keeps status cards filtering the dashboard", () => {
    const onFilter = vi.fn();
    render(<StatsBar summary={summary} activeFilter="ALL" onFilter={onFilter} />);

    fireEvent.click(screen.getByRole("button", { name: "2 주의" }));
    expect(onFilter).toHaveBeenCalledWith("CAUTION");
  });
});
