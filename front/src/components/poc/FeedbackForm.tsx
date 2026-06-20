import { useState } from "react";
import { MessageSquare, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { FEEDBACK_QUESTIONS, useFeedbackStore, type YesNo } from "@/stores/feedbackStore";

/** 직원 피드백 수집 (PoC 검증용, 인메모리) */
export function FeedbackForm() {
  const add = useFeedbackStore((s) => s.add);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<(YesNo | null)[]>(FEEDBACK_QUESTIONS.map(() => null));
  const [memo, setMemo] = useState("");
  const [done, setDone] = useState(false);

  function set(i: number, v: YesNo) {
    setAnswers((a) => a.map((x, idx) => (idx === i ? v : x)));
  }
  function submit() {
    add(answers, memo.trim());
    setDone(true);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border-2 border-border bg-surface px-5 text-xl font-bold text-ink-soft hover:bg-surface2"
      >
        <MessageSquare className="h-6 w-6" />
        선생님 의견 남기기
      </button>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-border bg-surface p-5">
      {done ? (
        <div className="py-6 text-center">
          <Check className="mx-auto mb-2 h-12 w-12 text-status-stable" />
          <p className="text-2xl font-bold text-ink">소중한 의견 감사합니다.</p>
          <Button className="mt-4" variant="secondary" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </div>
      ) : (
        <>
          <h3 className="mb-4 text-2xl font-extrabold text-ink">선생님 의견을 들려주세요</h3>
          <div className="space-y-3">
            {FEEDBACK_QUESTIONS.map((q, i) => (
              <div key={q} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xl text-ink">{i + 1}. {q}</span>
                <div className="flex gap-2">
                  {(["예", "아니오"] as YesNo[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => set(i, v)}
                      className={cn(
                        "min-h-[48px] rounded-xl px-5 text-xl font-bold",
                        answers[i] === v
                          ? "bg-brand text-white"
                          : "border-2 border-border text-ink-soft hover:bg-surface2"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="메모 (선택)"
            className="mt-4 w-full rounded-xl border-2 border-border bg-surface p-3 text-xl text-ink focus:border-brand focus:outline-none"
          />
          <div className="mt-4 flex gap-2">
            <Button className="min-h-[52px] text-xl" onClick={submit}>
              제출
            </Button>
            <Button variant="ghost" className="min-h-[52px] text-xl" onClick={() => setOpen(false)}>
              취소
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
