import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { getAlertSettings, updateAlertSettings } from "@/services/api/alertSettings";
import type { AlertSettings } from "@/services/api/alertSettings";

export function AdminAlertSettingsPage() {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [email, setEmail] = useState("");
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    getAlertSettings()
      .then((value) => {
        setSettings(value);
        setEmail(value.notificationEmail ?? "");
        setEmailAlertsEnabled(value.emailAlertsEnabled);
        setError(null);
      })
      .catch((err) => {
        setSettings(null);
        setError(err instanceof Error ? err.message : "알림 설정을 불러오지 못했습니다.");
      });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateAlertSettings({
        notificationEmail: email.trim().length > 0 ? email.trim() : null,
        emailAlertsEnabled,
      });
      setSettings(updated);
      setEmail(updated.notificationEmail ?? "");
      setEmailAlertsEnabled(updated.emailAlertsEnabled);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) {
    return <p className="text-sm text-status-danger">알림 설정을 불러오지 못했습니다. {error}</p>;
  }
  if (!settings) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="이메일 알림 설정"
        description="위험 이벤트 발생 시 이메일로 알림을 받을 주소와 수신 여부를 설정합니다."
      />
      {error && <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>}
      {saved && !error && (
        <p className="rounded-lg bg-status-stableBg px-3 py-2 text-sm text-status-stable">알림 설정이 저장되었습니다.</p>
      )}
      <Card className="space-y-4 p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field
            label="알림 이메일"
            hint={`비워두면 로그인 이메일(${settings.effectiveEmail ?? "-"})로 발송됩니다.`}
          >
            <Input
              type="email"
              placeholder={settings.effectiveEmail ?? ""}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <div className="border-t border-border pt-4">
            <Toggle
              label="이메일 알림 받기"
              hint="관리자만 이메일 알림을 받을 수 있습니다."
              checked={emailAlertsEnabled}
              onChange={setEmailAlertsEnabled}
            />
          </div>

          <Button type="submit" disabled={saving}>
            저장
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
