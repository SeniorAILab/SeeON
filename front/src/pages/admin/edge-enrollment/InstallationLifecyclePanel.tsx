import { useState } from "react";
import { Activity, ArrowRightLeft, RefreshCw } from "lucide-react";

import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  createEdgeValidationRun,
  listEdgeValidationEvents,
  replaceEdgeInstallation,
  transferEdgeOwnership,
  type OneTimeCredential,
} from "@/services/edgeAdminService";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { createIdempotencyKey, parseOwnershipManifest } from "./edgeAdminUi";

type InstallationLifecyclePanelProps = {
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly onCredential: (credential: OneTimeCredential, label: string) => void;
  readonly onChanged: () => void;
};

type Confirmation = "replace" | "transfer" | null;

export function InstallationLifecyclePanel({
  edgeInstallationId,
  enrollmentGeneration,
  onCredential,
  onChanged,
}: InstallationLifecyclePanelProps) {
  const [clientRef, setClientRef] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("900");
  const [serverRevision, setServerRevision] = useState("");
  const [manifestDigest, setManifestDigest] = useState("");
  const [manifest, setManifest] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleReplace(): Promise<void> {
    setConfirmation(null);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await replaceEdgeInstallation({
        edgeInstallationId,
        expectedEnrollmentGeneration: enrollmentGeneration,
        newClientInstallationRef: clientRef.trim(),
        idempotencyKey: createIdempotencyKey(),
      });
      if (result.kind === "initial") {
        onCredential(result.oneTimeCredential, "설치 교체 자격");
      } else {
        setStatus("이미 처리된 교체 요청입니다. 자격 증명은 다시 표시되지 않습니다.");
      }
      setClientRef("");
      onChanged();
    } catch (caught) {
      if (caught instanceof Error) {
        setError("설치를 교체하지 못했습니다. 세대와 설치 참조 ID를 확인해 주세요.");
      } else {
        throw caught;
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleValidation(): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const run = await createEdgeValidationRun({
        edgeInstallationId,
        expectedEnrollmentGeneration: enrollmentGeneration,
        durationSeconds: Number(durationSeconds),
        idempotencyKey: createIdempotencyKey(),
      });
      const events = await listEdgeValidationEvents({
        edgeInstallationId,
        validationRunId: run.validationRunId,
      });
      setStatus(`검증 이벤트 ${events.length}건`);
    } catch (caught) {
      if (caught instanceof Error) {
        setError("검증 실행 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
      } else {
        throw caught;
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(): Promise<void> {
    setConfirmation(null);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const revision = Number(serverRevision);
      if (!Number.isInteger(revision) || revision < 0 || !/^[a-f0-9]{64}$/.test(manifestDigest)) {
        setError("매니페스트 정보와 서버 리비전을 확인해 주세요.");
        return;
      }
      const result = await transferEdgeOwnership({
        edgeInstallationId,
        expectedEnrollmentGeneration: enrollmentGeneration,
        expectedServerRevision: revision,
        manifestDigest,
        manifest: parseOwnershipManifest(manifest),
        idempotencyKey: createIdempotencyKey(),
      });
      setStatus(`카메라 ${result.transferred.cameras}개 이전 완료`);
      setManifest("");
      setManifestDigest("");
      setServerRevision("");
      onChanged();
    } catch (caught) {
      if (caught instanceof Error) {
        setError("소유권 이전 정보를 적용하지 못했습니다. 미리보기와 현재 리비전을 확인해 주세요.");
      } else {
        throw caught;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-lg font-bold text-ink">설치 수명주기 작업</h2>
        <p className="mt-1 break-keep text-sm text-ink-soft">
          선택한 설치의 {enrollmentGeneration}세대에만 적용됩니다. 모든 작업은 멱등하게 기록됩니다.
        </p>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg bg-status-stableBg px-3 py-2 text-sm text-status-stable">{status}</p> : null}

      <section aria-labelledby="replace-installation-title" className="border-t border-border pt-4">
        <h3 id="replace-installation-title" className="flex items-center gap-2 text-sm font-bold text-ink">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          설치 교체
        </h3>
        <p className="mt-1 break-keep text-xs text-ink-soft">
          기존 세대의 활성 토큰을 모두 즉시 폐기하고 새 설치 참조로 교체합니다.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="새 설치 참조 ID" htmlFor="edge-client-ref">
            <Input id="edge-client-ref" value={clientRef} onChange={(event) => setClientRef(event.target.value)} placeholder="UUID v4" />
          </Field>
          <Button variant="danger" disabled={busy || clientRef.trim().length === 0} onClick={() => setConfirmation("replace")}>
            설치 교체
          </Button>
        </div>
      </section>

      <section aria-labelledby="validation-run-title" className="border-t border-border pt-4">
        <h3 id="validation-run-title" className="flex items-center gap-2 text-sm font-bold text-ink">
          <Activity aria-hidden="true" className="h-4 w-4" />
          검증 실행
        </h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="검증 시간" htmlFor="edge-validation-duration">
            <Select id="edge-validation-duration" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)}>
              <option value="300">5분</option>
              <option value="900">15분</option>
              <option value="1800">30분</option>
            </Select>
          </Field>
          <Button variant="secondary" disabled={busy} onClick={() => void handleValidation()}>
            검증 실행
          </Button>
        </div>
      </section>

      <section aria-labelledby="ownership-transfer-title" className="border-t border-border pt-4">
        <h3 id="ownership-transfer-title" className="flex items-center gap-2 text-sm font-bold text-ink">
          <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          소유권 이전
        </h3>
        <p className="mt-1 break-keep text-xs text-ink-soft">
          엣지 토폴로지 미리보기에서 받은 정확한 다이제스트와 매니페스트만 승인하세요.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="서버 리비전" htmlFor="edge-server-revision">
            <Input id="edge-server-revision" inputMode="numeric" value={serverRevision} onChange={(event) => setServerRevision(event.target.value)} />
          </Field>
          <Field label="매니페스트 다이제스트" htmlFor="edge-manifest-digest">
            <Input id="edge-manifest-digest" value={manifestDigest} onChange={(event) => setManifestDigest(event.target.value.trim())} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="소유권 이전 매니페스트" htmlFor="edge-transfer-manifest">
            <Textarea id="edge-transfer-manifest" rows={5} value={manifest} onChange={(event) => setManifest(event.target.value)} placeholder='[{"kind":"CAMERA",...}]' />
          </Field>
        </div>
        <Button className="mt-3" variant="danger" disabled={busy || manifest.length === 0} onClick={() => setConfirmation("transfer")}>
          소유권 이전
        </Button>
      </section>

      {confirmation === "replace" ? (
        <ConfirmActionDialog
          title="설치를 교체하시겠습니까?"
          description="현재 세대의 모든 활성 자격이 즉시 폐기됩니다. 새 자격은 한 번만 복사할 수 있습니다."
          confirmLabel="설치 교체 확인"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleReplace()}
        />
      ) : null}
      {confirmation === "transfer" ? (
        <ConfirmActionDialog
          title="소유권을 이전하시겠습니까?"
          description="현재 리비전에 고정된 매니페스트 항목의 관리 주체가 엣지로 변경됩니다."
          confirmLabel="소유권 이전 확인"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleTransfer()}
        />
      ) : null}
    </Card>
  );
}
