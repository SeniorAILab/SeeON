// =============================================================
// 사전 생성용 Synthesizer (generate-tts 스크립트에서 사용)
//   문장 → mp3 바이트. 키가 있으면 CLOVA/Google, 없으면 Mock(빈 파일).
//   클라이언트 런타임에서는 import 하지 않는다.
//   (Node 전용 타입(Buffer 등)을 피해 앱 타입체크와 호환되게 작성)
// =============================================================

export interface TTSSynthesizer {
  readonly name: string;
  readonly real: boolean; // 실제 음성 바이트를 생성하는가
  synthesize(text: string): Promise<Uint8Array>;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Naver CLOVA Voice (Premium) */
export class ClovaSynthesizer implements TTSSynthesizer {
  readonly name = "clova-voice";
  readonly real = true;
  constructor(private id: string, private secret: string, private speaker = "nara") {}
  async synthesize(text: string): Promise<Uint8Array> {
    const res = await fetch("https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts", {
      method: "POST",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": this.id,
        "X-NCP-APIGW-API-KEY": this.secret,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ speaker: this.speaker, text, format: "mp3", speed: "0" }),
    });
    if (!res.ok) throw new Error(`CLOVA TTS 실패: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Google Cloud TTS */
export class GoogleSynthesizer implements TTSSynthesizer {
  readonly name = "google-tts";
  readonly real = true;
  constructor(private apiKey: string, private voice = "ko-KR-Wavenet-A") {}
  async synthesize(text: string): Promise<Uint8Array> {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "ko-KR", name: this.voice, ssmlGender: "FEMALE" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.96 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Google TTS 실패: ${res.status}`);
    const json = (await res.json()) as { audioContent: string };
    return base64ToBytes(json.audioContent);
  }
}

/** Mock — 키 없을 때. 빈 플레이스홀더(런타임은 브라우저 음성으로 폴백). */
export class MockSynthesizer implements TTSSynthesizer {
  readonly name = "mock";
  readonly real = false;
  async synthesize(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
}

export function getSynthesizer(env: Record<string, string | undefined>): TTSSynthesizer {
  if (env.CLOVA_CLIENT_ID && env.CLOVA_CLIENT_SECRET) {
    return new ClovaSynthesizer(env.CLOVA_CLIENT_ID, env.CLOVA_CLIENT_SECRET, env.CLOVA_SPEAKER);
  }
  if (env.GOOGLE_TTS_API_KEY) {
    return new GoogleSynthesizer(env.GOOGLE_TTS_API_KEY, env.GOOGLE_TTS_VOICE);
  }
  return new MockSynthesizer();
}
