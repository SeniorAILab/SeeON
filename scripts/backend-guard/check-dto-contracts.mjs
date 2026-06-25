#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const fixtureIndex = args.indexOf("--fixture");
const scanRoot =
  fixtureIndex >= 0 && args[fixtureIndex + 1]
    ? resolve(root, args[fixtureIndex + 1])
    : join(root, "backend/src");

const allowedDtoSuffixes = [
  "RequestDto",
  "ResponseDto",
  "QueryDto",
  "ParamsDto",
  "MessageDto",
  "StatusDto",
];

const violations = [];

for (const file of walk(scanRoot)) {
  if (!file.endsWith(".ts")) continue;
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  if (file.endsWith(".dto.ts")) {
    checkDtoExports(rel, text);
  }
  if (file.endsWith(".controller.ts")) {
    checkControllerBoundary(rel, text);
  }
}

if (violations.length > 0) {
  console.error("backend DTO contract violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  exit(1);
}

function checkDtoExports(file, text) {
  const exportPattern =
    /export\s+(?:type|interface|class)\s+([A-Za-z0-9_]*Dto)\b/g;
  for (const match of text.matchAll(exportPattern)) {
    const name = match[1];
    if (!allowedDtoSuffixes.some((suffix) => name.endsWith(suffix))) {
      violations.push(
        `${file}: exported DTO '${name}' must end with ${allowedDtoSuffixes.join(" | ")}`,
      );
    }
  }
}

function checkControllerBoundary(file, text) {
  const recordBoundaryPattern =
    /@(Body|Query|Param)\([^)]*\)\s*(?:\r?\n\s*)?[A-Za-z0-9_]+:\s*Record<string,\s*unknown>/g;
  if (recordBoundaryPattern.test(text)) {
    violations.push(
      `${file}: controller boundary must not use Record<string, unknown>; define a RequestDto/QueryDto/ParamsDto`,
    );
  }
  const inlineBoundaryPatterns = [
    ["Body", "RequestDto"],
    ["Query", "QueryDto"],
    ["Param", "ParamsDto"],
  ];
  for (const [decorator, suffix] of inlineBoundaryPatterns) {
    const inlineBoundaryPattern = new RegExp(
      `@${decorator}\\([^)]*\\)\\s*(?:\\r?\\n\\s*)?[A-Za-z0-9_]+:\\s*\\{`,
      "g",
    );
    for (const _match of text.matchAll(inlineBoundaryPattern)) {
      violations.push(
        `${file}: @${decorator}() must use a named *${suffix}, not an inline object type`,
      );
    }
  }
  const bodyTypePattern =
    /@Body\([^)]*\)\s*(?:\r?\n\s*)?[A-Za-z0-9_]+:\s*([A-Za-z0-9_]+)/g;
  for (const match of text.matchAll(bodyTypePattern)) {
    const typeName = match[1];
    if (!typeName.endsWith("RequestDto")) {
      violations.push(
        `${file}: @Body() type '${typeName}' must end with RequestDto`,
      );
    }
  }
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...walk(path));
      continue;
    }
    if (entry.isFile() && statSync(path).isFile()) {
      files.push(path);
    }
  }
  return files;
}
