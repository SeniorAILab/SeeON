import { useEffect, useRef, useState } from "react";
import { Copy, KeyRound, X } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import type { OneTimeCredential } from "@/services/edgeAdminService";

type OneTimeCredentialDialogProps = {
  readonly credential: OneTimeCredential;
  readonly facilityCode: string | null;
  readonly contextLabel: string;
  readonly onClose: () => void;
  readonly onCopied: () => void;
};

export function OneTimeCredentialDialog({
  credential,
  facilityCode,
  contextLabel,
  onClose,
  onCopied,
}: OneTimeCredentialDialogProps) {
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    copyRef.current?.focus();
  }, []);

  function close(): void {
    credential.dispose();
    onClose();
  }

  async function copyOnce(): Promise<void> {
    const value = credential.consume();
    if (value === null) {
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      if (error instanceof Error) {
        setCopyError(true);
        return;
      }
      throw error;
    }
    onCopied();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="일회용 자격 증명"
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-modal"
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg bg-status-cautionBg p-2 text-status-caution">
              <KeyRound aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink">{contextLabel}</h2>
              <p className="mt-1 break-keep text-sm leading-relaxed text-ink-soft">
                자격 증명은 지금 한 번만 복사할 수 있습니다. 창을 닫거나 다른
                화면으로 이동하면 자동으로 폐기되며 다시 표시되지 않습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="일회용 자격 창 닫기"
            className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            onClick={close}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {facilityCode === null ? null : (
          <div className="mt-5 rounded-lg bg-surface2 p-4">
            <p className="text-xs font-semibold text-ink-soft">시설 코드</p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-ink">
              {facilityCode}
            </p>
          </div>
        )}

        {copyError ? (
          <p role="alert" className="mt-4 rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
            복사하지 못했습니다. 안전을 위해 자격 증명은 폐기되었습니다. 새로
            발급해 주세요.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={close}>닫기</Button>
          <Button ref={copyRef} onClick={() => void copyOnce()}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            자격 증명 복사
          </Button>
        </div>
      </section>
    </div>
  );
}
