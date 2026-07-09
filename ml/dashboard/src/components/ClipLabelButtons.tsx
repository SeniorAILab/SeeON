import { useState } from 'react';
import { labelClip, type Clip, type ClipLabel } from '../api/client';

const LABELS: Array<{ value: ClipLabel; text: string; className: string }> = [
  { value: 'TRUE_POSITIVE', text: '진짜 낙상', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { value: 'FALSE_POSITIVE', text: '오탐', className: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
  { value: 'UNREVIEWED', text: '미검토', className: 'bg-surface2 text-ink-soft hover:bg-surface2' },
];

type ClipLabelButtonsProps = {
  clip: Clip;
  onChanged: (clip: Clip) => void;
};

export function koreanClipLabel(label: ClipLabel | null): string {
  if (label === 'TRUE_POSITIVE') return '진짜 낙상';
  if (label === 'FALSE_POSITIVE') return '오탐';
  if (label === 'UNREVIEWED') return '미검토';
  return '미검토';
}

export function ClipLabelButtons({ clip, onChanged }: ClipLabelButtonsProps): JSX.Element {
  const [busyLabel, setBusyLabel] = useState<ClipLabel | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick(nextLabel: ClipLabel): Promise<void> {
    setBusyLabel(nextLabel);
    setMessage(null);
    try {
      const updated = await labelClip(clip.id, nextLabel);
      onChanged(updated);
      setMessage(`${koreanClipLabel(nextLabel)} 라벨을 저장했습니다.`);
    } catch {
      setMessage('라벨 저장에 실패했습니다.');
    } finally {
      setBusyLabel(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LABELS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => void handleClick(entry.value)}
            disabled={busyLabel !== null}
            aria-pressed={clip.label === entry.value}
            className={`rounded-full px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60 ${entry.className} ${
              clip.label === entry.value ? 'ring-2 ring-brand' : ''
            }`}
          >
            {busyLabel === entry.value ? '저장 중...' : entry.text}
          </button>
        ))}
      </div>
      {message ? (
        <p className="mt-2 text-xs font-bold text-ink-soft" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
