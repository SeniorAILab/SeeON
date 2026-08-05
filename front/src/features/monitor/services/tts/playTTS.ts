// =============================================================
// playTTS — 고정 문구를 브라우저 음성으로 발화
//   · cancel() 로 현재 발화 즉시 중단(확인 완료 대응)
// =============================================================
import { getTTSProvider, type TTSSpeakResult } from "./ttsProvider";

/** 텍스트를 음성 합성으로 재생하고 결과를 그대로 돌려준다. */
export async function playTTS(text: string): Promise<TTSSpeakResult> {
  return getTTSProvider().speak(text);
}


export function cancelTTS() {
  getTTSProvider().cancel();
}
