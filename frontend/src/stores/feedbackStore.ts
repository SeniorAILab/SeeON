import { create } from "zustand";

// 직원 피드백(인메모리 mock). 5개 질문 + 메모.
export const FEEDBACK_QUESTIONS = [
  "어디를 확인해야 하는지 바로 알 수 있었나요?",
  "음성 안내가 도움이 되었나요?",
  "알림이 너무 자주 울렸나요?",
  "글씨 크기는 적당했나요?",
  "실제 근무 중 사용할 수 있을 것 같나요?",
] as const;

export type YesNo = "예" | "아니오";

export interface FeedbackResponse {
  id: string;
  createdAt: number;
  answers: (YesNo | null)[]; // 질문 순서대로
  memo: string;
}

interface FeedbackState {
  responses: FeedbackResponse[];
  add: (answers: (YesNo | null)[], memo: string) => void;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  responses: [],
  add: (answers, memo) =>
    set((s) => ({
      responses: [
        { id: `fb_${Date.now()}`, createdAt: Date.now(), answers, memo },
        ...s.responses,
      ],
    })),
}));
