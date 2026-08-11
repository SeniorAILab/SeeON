import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import {
  AlertMediaDownloadError,
  canDownloadAlertAttachment,
  downloadAlertMediaAttachment,
  type AlertMediaDownloadErrorCode,
} from "@/services/api/alertMediaDownloads";
import { useAuthStore } from "@/stores/authStore";

type DownloadState =
  | { readonly kind: "idle" }
  | { readonly kind: "downloading" }
  | { readonly kind: "success" }
  | { readonly kind: "error"; readonly message: string };

export function AlertMediaDownloadButton({ alertId }: { readonly alertId: string }) {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const [state, setState] = useState<DownloadState>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  if (!canDownloadAlertAttachment(role)) return null;

  async function handleDownload(): Promise<void> {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "downloading" });
    try {
      const attachment = await downloadAlertMediaAttachment({
        alertId,
        signal: controller.signal,
      });
      const objectUrl = URL.createObjectURL(attachment.content);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = attachment.filename;
        anchor.rel = "noopener";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      if (!controller.signal.aborted) setState({ kind: "success" });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof AlertMediaDownloadError) {
        setState({ kind: "error", message: errorMessage(error.code) });
        return;
      }
      if (error instanceof Error) {
        setState({
          kind: "error",
          message: "다운로드를 준비하지 못했습니다. 다시 시도해 주세요.",
        });
        return;
      }
      throw error;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface2 px-3 py-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={state.kind === "downloading"}
        onClick={() => void handleDownload()}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        {state.kind === "downloading" ? "다운로드 준비 중" : "사건 영상 다운로드"}
      </Button>
      {state.kind === "success" ? (
        <p role="status" className="text-sm font-semibold text-status-stable">
          다운로드를 시작했습니다.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p role="alert" className="text-sm font-semibold text-status-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function errorMessage(code: AlertMediaDownloadErrorCode): string {
  switch (code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "다운로드 권한이 없습니다.";
    case "UNAVAILABLE":
      return "다운로드할 영상이 없습니다.";
    case "RANGE_NOT_SATISFIABLE":
      return "전체 영상을 다시 요청해 주세요.";
    case "UNEXPECTED":
      return "다운로드를 준비하지 못했습니다. 다시 시도해 주세요.";
  }
}
