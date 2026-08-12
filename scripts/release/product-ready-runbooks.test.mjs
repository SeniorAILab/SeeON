import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const releaseDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(releaseDirectory, "../..");
const runbookDirectory = join(repositoryRoot, "docs/runbooks");
const signalHelper = join(releaseDirectory, "await-exact-signal.mjs");
const checker = join(releaseDirectory, "check-product-ready.mjs");
const runbooks = [
  join(runbookDirectory, "product-ready-cutover.md"),
  join(runbookDirectory, "post-product-ready-cleanup-and-rename.md"),
  join(runbookDirectory, "product-ready-evidence.template.md"),
];

function markdownLinks(content) {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  );
}

test("all local runbook links and artifact evidence anchors resolve", () => {
  for (const runbook of runbooks) {
    const content = readFileSync(runbook, "utf8");
    for (const link of markdownLinks(content)) {
      if (/^https:\/\//.test(link)) continue;
      const [pathPart, fragment] = link.split("#", 2);
      const target = resolve(dirname(runbook), pathPart);
      assert.equal(existsSync(target), true, `${runbook}: ${link}`);
      if (fragment) {
        const targetContent = readFileSync(target, "utf8");
        assert.match(
          targetContent,
          new RegExp(`(?:id=["']${fragment}["']|^#{1,6} .+)$`, "m"),
          `${runbook}: ${link}`,
        );
      }
    }
  }

  const templatePath = join(
    runbookDirectory,
    "product-ready-artifact.template.json",
  );
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  const references = [
    template.origins.evidence,
    template.deployment.evidence,
    ...template.rows.map((row) => row.evidence),
  ];
  for (const reference of references) {
    const [pathPart, fragment] = reference.split("#", 2);
    const target = resolve(dirname(templatePath), pathPart);
    assert.equal(existsSync(target), true, reference);
    assert.match(
      readFileSync(target, "utf8"),
      new RegExp(`id=["']${fragment}["']`),
      reference,
    );
  }
});

test("cutover runbook covers every Issue #4 row and all operational planes", () => {
  const content = readFileSync(runbooks[0], "utf8");
  const ids = [...content.matchAll(/^\| (\d{1,2}) \|/gm)].map((match) =>
    Number(match[1]),
  );
  assert.deepEqual(ids, Array.from({ length: 24 }, (_, index) => index + 1));

  for (const required of [
    "DNS",
    "TLS",
    "Vercel Production identity",
    "Caddy certificate and ingress",
    "Edge continuity observation",
    "Advisory rollback metadata",
    "cleanup and rename",
  ]) {
    assert.match(content, new RegExp(required, "i"), required);
  }
});

test("runbook blocking commands use exact subscriptions and bounded deadlines", () => {
  const combined = runbooks
    .slice(0, 2)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.doesNotMatch(combined, /\bsleep\b|setInterval|while\s+.*(?:curl|status)|until\s+.*(?:curl|status)/i);
  const bashBlocks = [...combined.matchAll(/```bash\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  const signalBlocks = bashBlocks.filter((block) =>
    block.includes("await-exact-signal.mjs"),
  );
  assert.ok(signalBlocks.length >= 9, "expected exact-signal blocks for all planes");
  for (const block of signalBlocks) {
    assert.match(block, /--timeout-ms\s+[1-9][0-9]*/);
    assert.match(block, /--ready-json\s+'/);
    assert.match(block, /--signal-json\s+'/);
    assert.match(block, /--subscribe-command\s+/);
  }
});

test("artifact template is fail-closed but every reference resolves", () => {
  const templatePath = join(
    runbookDirectory,
    "product-ready-artifact.template.json",
  );
  const result = spawnSync(process.execPath, [checker, templatePath], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /every PRODUCT_READY row must be PASS/);
  assert.doesNotMatch(result.stderr, /does not resolve|fragment does not resolve/);
});

test("exact-signal helper subscribes before trigger and matches exact NDJSON", () => {
  const root = mkdtempSync(join(tmpdir(), "exact-signal-helper-"));
  try {
    const watchedPath = join(root, "event.json");
    const sideEffectPath = join(root, "triggered.txt");
    const subscriberPath = join(root, "subscriber.mjs");
    writeFileSync(
      subscriberPath,
      `import { readFileSync, watch } from "node:fs";\n` +
        `const [watched] = process.argv.slice(2);\n` +
        `const watcher = watch(watched, { persistent: true }, () => {\n` +
        `  const value = readFileSync(watched, "utf8").trim();\n` +
        `  if (value) { console.log(value); watcher.close(); }\n` +
        `});\n` +
        `console.log(JSON.stringify({signal:"fixture",state:"SUBSCRIBED"}));\n`,
    );
    writeFileSync(watchedPath, "");
    const target = JSON.stringify({ signal: "fixture", state: "MATCHED" });
    const subscribeCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(subscriberPath)} ${JSON.stringify(watchedPath)}`;
    const triggerCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(watchedPath)}, ${JSON.stringify(`${target}\n`)}); require("node:fs").writeFileSync(${JSON.stringify(sideEffectPath)}, "yes\\n")`)}`;

    const result = spawnSync(
      process.execPath,
      [
        signalHelper,
        "--timeout-ms",
        "3000",
        "--ready-json",
        '{"signal":"fixture","state":"SUBSCRIBED"}',
        "--signal-json",
        target,
        "--subscribe-command",
        subscribeCommand,
        "--trigger-command",
        triggerCommand,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(sideEffectPath), true);
    assert.deepEqual(JSON.parse(result.stdout), {
      matched: true,
      event: { signal: "fixture", state: "MATCHED" },
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
