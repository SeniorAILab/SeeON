import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionLogForm } from "./ActionLogForm";

describe("ActionLogForm", () => {
  it("submits backend-backed memo and acknowledge actions", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(<ActionLogForm onSubmit={onSubmit} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("저장 API가 없어")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("메모를 입력하세요."), { target: { value: "상태 확인 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("MEMO", "상태 확인 메모");
    });

    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("ACKNOWLEDGED", "");
    });
  });
});
