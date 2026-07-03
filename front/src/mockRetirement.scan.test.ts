import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
const testFile = "mockRetirement.scan.test.ts";

const inactiveFixtureIsland = new Set([
  "data/mockData.ts",
  "services/db.ts",
  "services/adminService.ts",
  "services/residentService.ts",
  "services/zoneService.ts",
  "pages/admin/FocusResidentsPage.tsx",
  "pages/admin/FocusResidentsPage.test.tsx",
  "pages/admin/AdminAssignmentsPage.tsx",
  "pages/admin/AdminAssignmentsPage.test.tsx",
  "pages/admin/AdminAlertRulesPage.tsx",
  "pages/admin/AdminAlertRulesPage.test.tsx",
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
  return path.relative(srcRoot, absolutePath).split(path.sep).join("/");
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

  return path
    .normalize(path.join(path.dirname(importer), specifier))
    .split(path.sep)
    .join("/")
    .replace(/\.(tsx?|jsx?)$/, "");
}

function importSources(relativePath: string, source: string): string[] {
  const imports = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
  );
  return Array.from(imports, (match) => normalizeImportSource(relativePath, match[1] ?? match[2]))
    .filter((specifier): specifier is string => specifier !== null);
}


function findMatches(files: Record<string, string>, predicate: (relativePath: string, source: string) => boolean): string[] {
  return Object.entries(files)
    .filter(([relativePath, source]) => predicate(relativePath, source))
    .map(([relativePath]) => relativePath)
    .sort();
}

const retiredFixtureModulePattern =
  /^(?:data\/mockData|services\/db|services\/(?:adminService|residentService|zoneService))$/;

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

  it("keeps retired fixture module imports inside the inactive fixture island only", async () => {
    const files = Object.fromEntries(
      await Promise.all(
        (await collectSourceFiles()).map(async (absolutePath) => [
          toRelative(absolutePath),
          await readFile(absolutePath, "utf8"),
        ])
      )
    );

    const fixtureImporters = findMatches(files, (relativePath, source) =>
      importSources(relativePath, source).some((specifier) => retiredFixtureModulePattern.test(specifier))
    );
    expect(fixtureImporters.filter((relativePath) => !inactiveFixtureIsland.has(relativePath))).toEqual([]);

    const mockDataImporters = findMatches(files, (relativePath, source) =>
      importSources(relativePath, source).includes("data/mockData")
    );
    expect(mockDataImporters).toEqual(["services/db.ts"]);
  });
});
