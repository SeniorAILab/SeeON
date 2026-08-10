import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";

import { PageHeader } from "@/components/PageHeader";
import { Button, Card } from "@/components/ui/primitives";
import {
  canAdministerEdgeCredentials,
  issueEdgeCredential,
  listEdgeCredentials,
  revokeEdgeCredential,
  rotateEdgeCredential,
  type OneTimeCredential,
  type RedactedEdgeCredential,
} from "@/services/edgeAdminService";
import { useAuthStore } from "@/stores/authStore";
import { ConfirmActionDialog } from "./edge-enrollment/ConfirmActionDialog";
import { CredentialInventory } from "./edge-enrollment/CredentialInventory";
import { createIdempotencyKey } from "./edge-enrollment/edgeAdminUi";
import { InstallationLifecyclePanel } from "./edge-enrollment/InstallationLifecyclePanel";
import { OneTimeCredentialDialog } from "./edge-enrollment/OneTimeCredentialDialog";

type Handoff = {
  readonly credential: OneTimeCredential;
  readonly facilityCode: string | null;
  readonly label: string;
};

type CredentialConfirmation = {
  readonly kind: "rotate" | "revoke";
  readonly credential: RedactedEdgeCredential;
} | null;

export function AdminEdgeEnrollmentPage() {
  const { facilityId } = useParams();
  const user = useAuthStore((state) => state.user);
  const [credentials, setCredentials] = useState<readonly RedactedEdgeCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [confirmation, setConfirmation] = useState<CredentialConfirmation>(null);
  const [selected, setSelected] = useState<RedactedEdgeCredential | null>(null);
  const handoffRef = useRef<Handoff | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (facilityId === undefined) return;
    const next = await listEdgeCredentials({ facilityId, signal });
    setCredentials(next);
    setSelected((current) => (
      current === null
        ? null
        : next.find((item) => item.tokenId === current.tokenId) ?? null
    ));
  }, [facilityId]);

  useEffect(() => {
    if (!canAdministerEdgeCredentials(user?.role ?? null)) return;
    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal)
      .catch((caught) => {
        if (caught instanceof Error && !controller.signal.aborted) {
          setError("등록 자격 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh, user?.role]);

  useEffect(() => () => handoffRef.current?.credential.dispose(), []);

  if (!canAdministerEdgeCredentials(user?.role ?? null)) {
    return <Navigate to="/access-denied" replace />;
  }
  if (facilityId === undefined) return <Navigate to="/facilities" replace />;

  function openHandoff(
    credential: OneTimeCredential,
    label: string,
    facilityCode: string | null = null,
  ): void {
    handoffRef.current?.credential.dispose();
    const next = { credential, label, facilityCode };
    handoffRef.current = next;
    setHandoff(next);
  }

  function closeHandoff(): void {
    handoffRef.current?.credential.dispose();
    handoffRef.current = null;
    setHandoff(null);
  }

  async function handleIssue(): Promise<void> {
    if (facilityId === undefined) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await issueEdgeCredential({
        facilityId,
        idempotencyKey: createIdempotencyKey(),
      });
      if (result.kind === "initial") {
        openHandoff(result.oneTimeCredential, "새 등록 자격", result.facilityCode);
      } else {
        setStatus("이미 처리된 발급 요청입니다. 자격 증명은 다시 표시되지 않습니다.");
      }
      await refresh();
    } catch (caught) {
      if (caught instanceof Error) {
        setError("새 등록 자격을 발급하지 못했습니다. 다시 시도해 주세요.");
      } else {
        throw caught;
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCredentialMutation(): Promise<void> {
    if (confirmation === null) return;
    const target = confirmation;
    setConfirmation(null);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (target.kind === "rotate") {
        const result = await rotateEdgeCredential({
          tokenId: target.credential.tokenId,
          idempotencyKey: createIdempotencyKey(),
        });
        if (result.kind === "initial") {
          openHandoff(result.oneTimeCredential, "교체된 등록 자격");
        } else {
          setStatus("이미 처리된 교체 요청입니다. 자격 증명은 다시 표시되지 않습니다.");
        }
      } else {
        await revokeEdgeCredential({
          tokenId: target.credential.tokenId,
          expectedLifecycle: target.credential.lifecycle === "GRACE" ? "GRACE" : "ACTIVE",
          idempotencyKey: createIdempotencyKey(),
        });
        setStatus("등록 자격을 폐기했습니다.");
      }
      await refresh();
    } catch (caught) {
      if (caught instanceof Error) {
        setError("등록 자격 상태를 변경하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
      } else {
        throw caught;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="엣지 등록 관리"
        description="시설 전용 엣지 자격을 발급하고 설치 세대와 검증 수명주기를 관리합니다."
        action={(
          <Button disabled={busy} onClick={() => void handleIssue()}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            새 등록 자격 발급
          </Button>
        )}
      />

      <Card className="flex items-start gap-3 p-4">
        <KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
        <div>
          <p className="text-sm font-semibold text-ink">자격 증명은 서버와 브라우저에 다시 표시되지 않습니다.</p>
          <p className="mt-1 break-keep text-sm text-ink-soft">
            발급·교체 직후 한 번만 복사하고 현장 전달 절차를 완료하세요. 목록에는 식별 가능한 접두사와 상태만 남습니다.
          </p>
        </div>
      </Card>

      {error ? <p role="alert" className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg bg-status-stableBg px-3 py-2 text-sm text-status-stable">{status}</p> : null}
      {loading ? (
        <Card className="p-6 text-center text-sm text-ink-soft" aria-busy="true">등록 자격을 불러오는 중입니다.</Card>
      ) : (
        <CredentialInventory
          credentials={credentials}
          selectedTokenId={selected?.tokenId ?? null}
          onRotate={(credential) => setConfirmation({ kind: "rotate", credential })}
          onRevoke={(credential) => setConfirmation({ kind: "revoke", credential })}
          onManage={setSelected}
        />
      )}

      {selected === null ? null : (
        <InstallationLifecyclePanel
          edgeInstallationId={selected.edgeInstallationId}
          enrollmentGeneration={selected.enrollmentGeneration}
          onCredential={(credential, label) => openHandoff(credential, label)}
          onChanged={() => void refresh()}
        />
      )}

      {confirmation?.kind === "rotate" ? (
        <ConfirmActionDialog
          title="토큰을 교체하시겠습니까?"
          description="현재 토큰은 24시간 교체 유예 상태가 되고 새 토큰은 한 번만 복사할 수 있습니다."
          confirmLabel="교체 확인"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleCredentialMutation()}
        />
      ) : null}
      {confirmation?.kind === "revoke" ? (
        <ConfirmActionDialog
          title="토큰을 폐기하시겠습니까?"
          description="폐기 즉시 이 토큰을 사용하는 엣지 연결이 차단되며 되돌릴 수 없습니다."
          confirmLabel="폐기 확인"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleCredentialMutation()}
        />
      ) : null}
      {handoff === null ? null : (
        <OneTimeCredentialDialog
          credential={handoff.credential}
          facilityCode={handoff.facilityCode}
          contextLabel={handoff.label}
          onClose={closeHandoff}
          onCopied={() => setStatus("자격 증명을 클립보드에 한 번 복사했습니다.")}
        />
      )}
    </div>
  );
}
