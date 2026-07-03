// 보존 파일: 직원 모니터의 TTS 트리거는 FloorMonitorPage/useTTSAlerts 단일 경로만 사용한다.
// announceFocus 호출부는 제거되었으며, 이 파일은 과거 import 호환 확인용으로만 남긴다.

export interface FocusAnnounceItem {
  name: string;
  room: string;
  reason: string;
}

export async function announceFocusResidents(_items: FocusAnnounceItem[]) {
  return;
}
