import { KeyRound, RotateCw, Settings2, ShieldX } from "lucide-react";

import { Button, Card } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import type {
  EdgeCredentialLifecycle,
  RedactedEdgeCredential,
} from "@/services/edgeAdminService";

const lifecycleLabels: Record<EdgeCredentialLifecycle, string> = {
  ACTIVE: "활성",
  GRACE: "교체 유예",
  EXPIRED: "만료",
  REVOKED: "폐기",
};

const lifecycleStyles: Record<EdgeCredentialLifecycle, string> = {
  ACTIVE: "bg-status-stableBg text-status-stable",
  GRACE: "bg-status-cautionBg text-status-caution",
  EXPIRED: "bg-surface2 text-ink-soft",
  REVOKED: "bg-status-dangerBg text-status-danger",
};

type CredentialInventoryProps = {
  readonly credentials: readonly RedactedEdgeCredential[];
  readonly selectedTokenId: string | null;
  readonly onRotate: (credential: RedactedEdgeCredential) => void;
  readonly onRevoke: (credential: RedactedEdgeCredential) => void;
  readonly onManage: (credential: RedactedEdgeCredential) => void;
};

export function CredentialInventory({
  credentials,
  selectedTokenId,
  onRotate,
  onRevoke,
  onManage,
}: CredentialInventoryProps) {
  if (credentials.length === 0) {
    return (
      <Card className="p-6 text-center">
        <KeyRound aria-hidden="true" className="mx-auto h-6 w-6 text-ink-faint" />
        <p className="mt-3 text-sm font-semibold text-ink">발급된 자격이 없습니다.</p>
        <p className="mt-1 text-sm text-ink-soft">
          새 등록 자격을 발급해 현장 엣지를 연결하세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {credentials.map((credential) => {
        const canRotate = credential.lifecycle === "ACTIVE";
        const canRevoke =
          credential.lifecycle === "ACTIVE" || credential.lifecycle === "GRACE";
        return (
          <Card
            key={credential.tokenId}
            className={selectedTokenId === credential.tokenId ? "border-brand p-5" : "p-5"}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p data-evidence-redact className="break-all font-mono text-sm font-semibold text-ink">
                  {credential.prefix}
                </p>
                <p className="mt-1 text-xs tabular-nums text-ink-faint">
                  {formatDateTime(credential.createdAt)} · {credential.enrollmentGeneration}세대
                </p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${lifecycleStyles[credential.lifecycle]}`}>
                {lifecycleLabels[credential.lifecycle]}
              </span>
            </div>
            <p data-evidence-redact className="mt-3 truncate text-xs text-ink-soft" title={credential.edgeInstallationId}>
              설치 {credential.edgeInstallationId}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canRotate ? (
                <Button size="sm" variant="secondary" onClick={() => onRotate(credential)}>
                  <RotateCw aria-hidden="true" className="h-4 w-4" />
                  토큰 교체
                </Button>
              ) : null}
              {canRevoke ? (
                <Button size="sm" variant="danger" onClick={() => onRevoke(credential)}>
                  <ShieldX aria-hidden="true" className="h-4 w-4" />
                  토큰 폐기
                </Button>
              ) : null}
              {canRotate ? (
                <Button size="sm" variant="ghost" onClick={() => onManage(credential)}>
                  <Settings2 aria-hidden="true" className="h-4 w-4" />
                  설치 작업
                </Button>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
