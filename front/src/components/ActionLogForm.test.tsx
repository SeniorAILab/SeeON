import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionLogForm } from "./ActionLogForm";

describe("ActionLogForm", () => {
  it("only submits the real backend-backed acknowledge action", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(<ActionLogForm onSubmit={onSubmit} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("보호자 연락")).toBeNull();
    expect(screen.getByText("메모·보호자 연락·병원 이송 기록은 저장 API가 없어 서버에 저장하지 않습니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("ACKNOWLEDGED", "");
    });
  });
});
