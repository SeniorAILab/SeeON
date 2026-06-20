/* =============================================================
 * TTS 사전 생성 스크립트
 *   각 공간 × 위험 단계 문장을 만들어 mp3 로 저장한다.
 *   실행:  npx tsx scripts/generate-tts.ts
 *   환경변수(있으면 실제 음성, 없으면 Mock 플레이스홀더):
 *     CLOVA_CLIENT_ID / CLOVA_CLIENT_SECRET [/ CLOVA_SPEAKER]
 *     GOOGLE_TTS_API_KEY [/ GOOGLE_TTS_VOICE]
 *   출력:
 *     public/audio/tts/<FLOOR>/<room>_<level>.mp3   (호실)
 *     public/audio/tts/common/<slug>_<level>.mp3     (공용)
 *     public/audio/tts/common/summary.mp3
 *     public/audio/tts/manifest.json                 (실제 생성 여부)
 *     public/audio/tts/sentences.json                (경로→문장, 외부 생성용)
 * ============================================================= */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { spaces, floors } from "../src/data/mockData";
import {
  LEVELS_BY_CATEGORY,
  summaryMessage,
  type AudioLevel,
} from "../src/services/tts/ttsConfig";
import {
  audioPathFor,
  categoryOf,
  summaryPath,
  textFor,
  type AudioManifest,
} from "../src/services/tts/audioMap";
import { getSynthesizer } from "../src/services/tts/synthesizer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../public");

interface Sentence {
  path: string;
  text: string;
}

function buildSentences(): Sentence[] {
  const floorName = (id: string) => floors.find((f) => f.id === id)?.name ?? "";
  const seen = new Set<string>();
  const list: Sentence[] = [];

  for (const s of spaces) {
    const category = categoryOf(s.type);
    for (const level of LEVELS_BY_CATEGORY[category] as AudioLevel[]) {
      const path = audioPathFor({ category, level, name: s.name, floorName: floorName(s.floorId) });
      if (seen.has(path)) continue; // 공용 공간(중앙복도 등)은 층 무관 1회만
      seen.add(path);
      list.push({ path, text: textFor(category, level, s.name) });
    }
  }
  // 요약 문구
  if (!seen.has(summaryPath)) {
    list.push({ path: summaryPath, text: summaryMessage(2) });
  }
  return list;
}

async function main() {
  const synth = getSynthesizer(process.env);
  const sentences = buildSentences();
  console.log(`TTS 생성: ${sentences.length}개 문장 · provider=${synth.name} (real=${synth.real})`);

  const manifest: AudioManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: synth.name,
    items: {},
  };

  for (const { path, text } of sentences) {
    // path 예: /audio/tts/2F/201_danger.mp3  → public 기준 상대경로
    const outFile = resolve(PUBLIC_DIR, "." + path);
    await mkdir(dirname(outFile), { recursive: true });
    try {
      const bytes = await synth.synthesize(text);
      await writeFile(outFile, bytes);
      manifest.items[path] = { text, real: synth.real && bytes.length > 0 };
    } catch (e) {
      console.warn(`  실패: ${path} — ${(e as Error).message}`);
      manifest.items[path] = { text, real: false };
    }
  }

  await writeFile(
    resolve(PUBLIC_DIR, "audio/tts/manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  await writeFile(
    resolve(PUBLIC_DIR, "audio/tts/sentences.json"),
    JSON.stringify(sentences, null, 2)
  );

  const realCount = Object.values(manifest.items).filter((i) => i.real).length;
  console.log(`완료: ${sentences.length}개 파일 · 실제 음성 ${realCount}개`);
  if (!synth.real) {
    console.log("ℹ️  키가 없어 Mock(빈 파일)로 생성됨 — 런타임은 브라우저 음성으로 폴백합니다.");
    console.log("    실제 mp3 생성: CLOVA/Google 키를 설정 후 다시 실행하세요.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
