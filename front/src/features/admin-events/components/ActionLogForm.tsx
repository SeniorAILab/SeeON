import { useState } from "react";
import { Button, Field } from "@/components/ui/primitives";
import { actionTypeLabel } from "@/lib/labels";
import type { ActionType } from "@/types";

const ACK_ACTION_TYPE: ActionType = "ACKNOWLEDGED";

/** 직원 조치 기록 폼 — 모든 위험 알림에는 조치 버튼이 동반되어야 한다(UX 원칙) */
export function ActionLogForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (type: ActionType, note: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"memo" | "ack" | null>(null);

  async function submit(type: ActionType) {
    const trimmed = note.trim();
    setBusy(type === ACK_ACTION_TYPE ? "ack" : "memo");
    try {
      await onSubmit(type, trimmed);
      setNote("");
    } finally {
      setBusy(null);
    }
  }

  if (disabled) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">
        조치 기록은 요양보호사 이상 권한에서 작성할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="조치 유형">
        <p className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm font-medium text-ink">
          {actionTypeLabel[ACK_ACTION_TYPE]}
        </p>
      </Field>
      <Field label="메모">
        <textarea
          className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
          value={note}
          placeholder="메모를 입력하세요."
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => submit("MEMO")} disabled={busy !== null || note.trim().length === 0} variant="secondary">
          {busy === "memo" ? "메모 저장 중..." : "메모 저장"}
        </Button>
        <Button onClick={() => submit(ACK_ACTION_TYPE)} disabled={busy !== null} className="w-full">
          {busy === "ack" ? "확인 처리 중..." : "확인 완료 처리"}
        </Button>
      </div>
    </div>
  );
}
