import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoAccessNotice } from "@/features/admin-events/components/video/VideoAccessNotice";

describe("VideoAccessNotice", () => {
  it("renders every policy as a short indivisible Korean sentence", () => {
    render(<VideoAccessNotice />);

    const emphasis = screen.getByText("이벤트 구간만");
    const sentenceTexts = [
      "AI가 위험으로 감지한 이벤트 구간만 제공합니다.",
      "관리자만 확인할 수 있습니다.",
      "직원용 화면에는 표시되지 않습니다.",
      "실시간 CCTV 탐색은 지원하지 않습니다.",
    ] as const;
    const sentences = [
      emphasis.parentElement,
      ...sentenceTexts.slice(1).map((text) => screen.getByText(text)),
    ];
    const notice = emphasis.closest("div");

    expect(sentences.map((sentence) => sentence?.textContent)).toEqual(sentenceTexts);
    for (const sentence of sentences) {
      expect(sentence?.classList.contains("inline-block")).toBe(true);
    }
    expect(notice?.classList.contains("break-keep")).toBe(true);
    expect(notice?.textContent).toBe(sentenceTexts.join(" "));
  });
});
