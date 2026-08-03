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

    // 메모 저장 후 입력이 비워지므로 확인 완료는 다시 잠긴다. 조치 기록 없이
    // 알림이 사라지면 사고 후 근거가 남지 않기 때문이다(백엔드도 거부한다).
    expect(
      (screen.getByRole("button", { name: "확인 완료 처리" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("메모를 입력하세요."), {
      target: { value: "방문해 확인 완료" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("ACKNOWLEDGED", "방문해 확인 완료");
    });
  });
});

describe("I3 — 조치 기록 없이 확인 완료 불가", () => {
  it("메모가 비어 있으면 확인 완료 버튼이 비활성이다", () => {
    render(<ActionLogForm onSubmit={vi.fn(async () => undefined)} />);

    const ackBtn = screen.getByRole("button", { name: "확인 완료 처리" });
    expect((ackBtn as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("조치 결과를 먼저 입력해야 확인 완료로 바꿀 수 있습니다.")
    ).not.toBeNull();
  });

  it("공백만 입력해도 여전히 비활성이다", () => {
    render(<ActionLogForm onSubmit={vi.fn(async () => undefined)} />);

    fireEvent.change(screen.getByPlaceholderText("메모를 입력하세요."), {
      target: { value: "   " },
    });

    expect(
      (screen.getByRole("button", { name: "확인 완료 처리" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("메모를 입력하면 확인 완료가 가능해지고 안내가 사라진다", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<ActionLogForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("메모를 입력하세요."), {
      target: { value: "방문해 상태 확인함" },
    });

    const ackBtn = screen.getByRole("button", { name: "확인 완료 처리" });
    expect((ackBtn as HTMLButtonElement).disabled).toBe(false);
    expect(
      screen.queryByText("조치 결과를 먼저 입력해야 확인 완료로 바꿀 수 있습니다.")
    ).toBeNull();

    fireEvent.click(ackBtn);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("ACKNOWLEDGED", "방문해 상태 확인함")
    );
  });
});
