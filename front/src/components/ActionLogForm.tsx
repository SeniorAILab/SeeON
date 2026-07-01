import { useState } from "react";
import { Button, Select, Textarea, Field } from "./ui/primitives";
import { actionTypeLabel } from "@/lib/labels";
import type { ActionType } from "@/types";

const ACTION_TYPES: ActionType[] = [
  "ACKNOWLEDGED",
  "STAFF_VISIT",
  "NO_ISSUE",
  "GUARDIAN_CONTACT",
  "HOSPITAL_TRANSFER",
  "MEMO",
];

/** 직원 조치 기록 폼 — 모든 위험 알림에는 조치 버튼이 동반되어야 한다(UX 원칙) */
export function ActionLogForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (type: ActionType, note: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [type, setType] = useState<ActionType>("ACKNOWLEDGED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await onSubmit(type, note.trim());
      setNote("");
      setType("ACKNOWLEDGED");
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
        <Select value={type} onChange={(e) => setType(e.target.value as ActionType)}>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {actionTypeLabel[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="메모 (선택)">
        <Textarea
          rows={2}
          placeholder="조치 내용을 입력하세요."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button onClick={handle} disabled={busy} className="w-full">
        {busy ? "기록 중..." : "조치 기록 저장"}
      </Button>
    </div>
  );
}
