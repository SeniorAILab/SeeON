import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/primitives";

type ConfirmActionDialogProps = {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

export function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="edge-confirm-title"
        aria-describedby="edge-confirm-description"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-modal"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-status-dangerBg p-2 text-status-danger">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="edge-confirm-title" className="text-lg font-bold text-ink">
              {title}
            </h2>
            <p
              id="edge-confirm-description"
              className="mt-2 break-keep text-sm leading-relaxed text-ink-soft"
            >
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
