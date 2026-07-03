// =============================================================
// TTS Provider 인터페이스 (교체 가능 설계)
//   MVP: 브라우저 SpeechSynthesis
//   상용화: Naver CLOVA Voice / Google Cloud TTS 로 교체
//   → 같은 인터페이스만 구현하면 상위 로직(큐/스케줄) 변경 없음.
// =============================================================

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSProvider {
  readonly name: string;
  isSupported(): boolean;
  /** 발화 완료 시 resolve. 중단되면 reject 없이 resolve. */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancel(): void;
}

/** 브라우저 SpeechSynthesis 구현 — 한국어 여성/차분한 톤 우선 */
export class BrowserTTSProvider implements TTSProvider {
  readonly name = "browser-speech-synthesis";
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (this.isSupported()) {
      this.loadVoice();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => this.loadVoice());
    }
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private loadVoice() {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.startsWith("ko"));
    if (voices.length === 0) return;
    // 여성/차분한 음성 우선 선택
    const prefer = ["yuna", "heami", "female", "여성", "google"];
    this.voice =
      voices.find((v) => prefer.some((p) => v.name.toLowerCase().includes(p))) ?? voices[0];
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.isSupported()) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      if (this.voice) u.voice = this.voice;
      u.rate = opts.rate ?? 0.96; // 차분하게
      u.pitch = opts.pitch ?? 1.0;
      u.volume = opts.volume ?? 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (this.isSupported()) window.speechSynthesis.cancel();
  }
}


let provider: TTSProvider | null = null;
export function getTTSProvider(): TTSProvider {
  if (!provider) provider = new BrowserTTSProvider();
  return provider;
}
