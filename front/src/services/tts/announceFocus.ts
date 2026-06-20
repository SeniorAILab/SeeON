// 관심 어르신 음성 안내 (야간/위험 상승 시 또는 직원 요청 시 1회 재생)
// 짧고 명확하게. 사전 생성 mp3 가 없으면 브라우저 음성으로 재생된다.
import { playTTS, cancelTTS } from "./playTTS";

export interface FocusAnnounceItem {
  name: string;
  room: string;
  reason: string;
}

export async function announceFocusResidents(items: FocusAnnounceItem[]) {
  cancelTTS();
  if (items.length === 0) return;
  const lines = [`오늘 집중 관찰 대상은 ${items.length}분입니다.`];
  for (const it of items.slice(0, 3)) {
    lines.push(`${it.room} ${it.name} 어르신을 더 자주 확인해주세요.`);
  }
  // 순차 재생
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    await playTTS(line);
  }
}
