// 시간/날짜 포맷 유틸 (KST 가정, 의존성 없이 경량 구현)

export function formatDateTime(iso: string): string {
  const d = validDateOrNull(iso);
  if (!d) return "—";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string): string {
  const d = validDateOrNull(iso);
  if (!d) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "12초 전", "3분 전" 같은 상대 시간 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const d = validDateOrNull(iso);
  if (!d) return "—";
  const diff = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (diff < 10) return "방금 전";
  if (diff < 60) return `${diff}초 전`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function validDateOrNull(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
