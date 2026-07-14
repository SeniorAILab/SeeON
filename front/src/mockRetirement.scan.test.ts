import { describe, expect, it } from "vitest";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
const frontRoot = path.resolve(srcRoot, "..");
const scriptsRoot = path.join(frontRoot, "scripts");
const testFile = "src/mockRetirement.scan.test.ts";

const removedFixtureFiles = new Set(
  [
    ["src", "services", "resident" + "Service.ts"],
    ["src", "services", "zone" + "Service.ts"],
    ["src", "pages/admin", "Focus" + "ResidentsPage.tsx"],
    ["src", "pages/admin", "Focus" + "ResidentsPage.test.tsx"],
    ["src", "pages/admin", "Admin" + "AssignmentsPage.tsx"],
    ["src", "pages/admin", "Admin" + "AssignmentsPage.test.tsx"],
    ["src", "pages/admin", "Admin" + "AlertRulesPage.tsx"],
    ["src", "pages/admin", "Admin" + "AlertRulesPage.test.tsx"],
  ].map((parts) => parts.join("/")),
);

const retiredFixturePaths = new Set([
  "src/data/mockData.ts",
  "src/services/db.ts",
  "src/services/adminService.ts",
  "src/services/tts/announceFocus.ts",
  "src/services/tts/synthesizer.ts",
  "scripts/generate-tts.ts",
  "public/audio/tts",
]);

async function collectSourceFiles(dir = srcRoot): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(absolutePath);
      if (/\.(ts|tsx)$/.test(entry.name)) return [absolutePath];
      return [];
    })
  );
  return files.flat();
}

function toRelative(absolutePath: string): string {
  return path.relative(frontRoot, absolutePath).split(path.sep).join("/");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isTestFile(relativePath: string): boolean {
  return /(?:^|[./])test\.[cm]?[tj]sx?$/.test(relativePath) || relativePath.includes(".test.");
}

function normalizeImportSource(importer: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2).replace(/\.(tsx?|jsx?)$/, "");
  if (!specifier.startsWith(".")) return null;

  const normalized = path
    .normalize(path.join(path.dirname(importer), specifier))
    .split(path.sep)
    .join("/")
    .replace(/\.(tsx?|jsx?)$/, "");

  return normalized.startsWith("src/") ? normalized.slice(4) : normalized;
}

function importSources(relativePath: string, source: string): string[] {
  const imports = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
  );
  return Array.from(imports, (match) => normalizeImportSource(relativePath, match[1] ?? match[2]))
    .filter((specifier): specifier is string => specifier !== null);
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(frontRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function findMatches(files: Record<string, string>, predicate: (relativePath: string, source: string) => boolean): string[] {
  return Object.entries(files)
    .filter(([relativePath, source]) => predicate(relativePath, source))
    .map(([relativePath]) => relativePath)
    .sort();
}

const retiredFixtureModulePattern =
  /^(?:data\/mockData|services\/db|services\/adminService|services\/tts\/announceFocus|services\/tts\/synthesizer)$/;

describe("retired frontend mock regressions", () => {
  it("keeps runtime mock switches and demo copy out of front/src", async () => {
    const files = Object.fromEntries(
      await Promise.all(
        (await collectSourceFiles()).map(async (absolutePath) => [
          toRelative(absolutePath),
          await readFile(absolutePath, "utf8"),
        ])
      )
    );

    const mockSwitchTokens = [["USE", "MOCK"].join("_"), ["VITE", "USE", "MOCK"].join("_")];
    const runtimeCopyPattern = new RegExp(["데모", "시연", "MVP"].join("|"));

    expect(
      findMatches(
        files,
        (relativePath, source) =>
          relativePath !== testFile && mockSwitchTokens.some((token) => source.includes(token))
      )
    ).toEqual([]);

    expect(
      findMatches(
        files,
        (relativePath, source) => relativePath !== testFile && source.includes("mocks/realtimeEngine")
      )
    ).toEqual([]);

    expect(
      findMatches(
        files,
        (relativePath, source) =>
          relativePath !== testFile && !isTestFile(relativePath) && runtimeCopyPattern.test(stripComments(source))
      )
    ).toEqual([]);
  });

  it("keeps retired fixture modules and pre-generated TTS assets deleted", async () => {
    const sourceFiles = [
      ...(await collectSourceFiles(srcRoot)),
      ...((await pathExists("scripts")) ? await collectSourceFiles(scriptsRoot) : []),
    ];
    const files = Object.fromEntries(
      await Promise.all(
        sourceFiles.map(async (absolutePath) => [
          toRelative(absolutePath),
          await readFile(absolutePath, "utf8"),
        ])
      )
    );

    const existingRetiredPaths = (
      await Promise.all(
        [...retiredFixturePaths].map(async (relativePath) =>
          (await pathExists(relativePath)) ? relativePath : null
        )
      )
    ).filter((relativePath): relativePath is string => relativePath !== null);
    expect(existingRetiredPaths).toEqual([]);

    const fixtureImporters = findMatches(files, (relativePath, source) =>
      importSources(relativePath, source).some((specifier) => retiredFixtureModulePattern.test(specifier))
    );
    expect(fixtureImporters).toEqual([]);

    expect([...removedFixtureFiles].filter((relativePath) => relativePath in files)).toEqual([]);
  });
});
