import type { CameraStatus, SystemSnapshot } from '../api/client';

const cameraStatusMeta: Record<CameraStatus, { label: string; className: string }> = {
  online: {
    label: '온라인',
    className: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  },
  offline: {
    label: '오프라인',
    className: 'bg-surface2 text-ink-soft ring-border',
  },
  starting: {
    label: '시작 중',
    className: 'bg-amber-100 text-amber-700 ring-amber-200',
  },
  unknown: {
    label: '확인 중',
    className: 'bg-violet-100 text-violet-700 ring-violet-200',
  },
};

export function getCameraStatusMeta(status: CameraStatus): { label: string; className: string } {
  return cameraStatusMeta[status] ?? cameraStatusMeta.unknown;
}

type StatusBadgeProps = {
  status: CameraStatus;
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const meta = getCameraStatusMeta(status);

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${meta.className}`}>
      <span className="mr-1.5 h-2 w-2 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function getBackendStatus(system: SystemSnapshot | null): { label: string; className: string } {
  if (!system) {
    return {
      label: '백엔드 확인 중',
      className: 'bg-slate-700 text-slate-100 ring-border',
    };
  }

  if (!system.backend.configured) {
    return {
      label: '백엔드 미설정',
      className: 'bg-amber-100 text-amber-800 ring-amber-200',
    };
  }

  if (system.backend.reachable === true) {
    return {
      label: '백엔드 연결됨',
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    };
  }

  if (system.backend.reachable === false) {
    return {
      label: '백엔드 연결 실패',
      className: 'bg-rose-100 text-rose-800 ring-rose-200',
    };
  }

  return {
    label: '백엔드 대기 중',
    className: 'bg-brand-soft text-brand ring-brand',
  };
}
