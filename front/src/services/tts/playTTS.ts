// =============================================================
// playTTS — 사전 생성 mp3 우선 재생, 없으면 브라우저 음성으로 폴백
//   · manifest.json 으로 "실제 생성된 파일"만 Audio 재생
//   · 파일이 없거나(미생성/모크) 로드 실패 시 SpeechSynthesis 폴백
//   · cancel() 로 현재 재생/발화 즉시 중단(확인 완료 대응)
// =============================================================
import { getTTSProvider } from "./ttsProvider";
import { MANIFEST_PATH, type AudioManifest } from "./audioMap";

let manifest: AudioManifest | null = null;
let manifestLoaded = false;

async function loadManifest(): Promise<AudioManifest | null> {
  if (manifestLoaded) return manifest;
  manifestLoaded = true;
  try {
    const res = await fetch(MANIFEST_PATH, { cache: "no-cache" });
    if (res.ok) manifest = (await res.json()) as AudioManifest;
  } catch {
    manifest = null; // 매니페스트 없으면 항상 음성 폴백
  }
  return manifest;
}

let currentAudio: HTMLAudioElement | null = null;

/** 사전 생성 파일이 실제로 있으면 재생, 아니면 텍스트로 음성 합성 */
export async function playTTS(text: string, audioPath?: string): Promise<void> {
  const m = await loadManifest();
  const entry = audioPath ? m?.items?.[audioPath] : undefined;

  if (audioPath && entry?.real) {
    try {
      await playFile(audioPath);
      return;
    } catch {
      // 파일 재생 실패 → 음성 폴백
    }
  }
  await getTTSProvider().speak(text);
}

function playFile(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(path);
    currentAudio = audio;
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio load error"));
    audio.play().catch(reject);
  });
}

export function cancelTTS() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  getTTSProvider().cancel();
}
