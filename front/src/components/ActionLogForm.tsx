import { useState } from "react";
import { Button, Field } from "./ui/primitives";
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
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await onSubmit(ACK_ACTION_TYPE, "");
    } finally {
      setBusy(false);
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
        <p className="mt-1 text-xs text-ink-faint">
          저장 가능한 조치는 백엔드 확인 완료 처리만 지원합니다.
        </p>
      </Field>
      <Field label="메모">
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-ink-faint">
          메모·보호자 연락·병원 이송 기록은 저장 API가 없어 서버에 저장하지 않습니다.
        </p>
      </Field>
      <Button onClick={handle} disabled={busy} className="w-full">
        {busy ? "확인 처리 중..." : "확인 완료 처리"}
      </Button>
    </div>
  );
}
