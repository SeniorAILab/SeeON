#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROW_IDS = Array.from({ length: 24 }, (_, index) => index + 1);
const RESULT_VALUES = new Set(["PASS", "FAIL"]);
const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const EMBARGO_END_MS = Date.parse("2026-08-17T00:00:00+09:00");
const PRODUCTION_FRONT_ORIGIN = "https://seeon.seniorsailab.com";
const PRODUCTION_API_ORIGIN = "https://api.seeon.seniorsailab.com";
const MAX_SCANNED_EVIDENCE_BYTES = 5 * 1024 * 1024;

const ROOT_KEYS = new Set([
  "schemaVersion",
  "gate",
  "artifactKind",
  "frontOrigin",
  "apiOrigin",
  "origins",
  "deploymentSha",
  "deployment",
  "rows",
  "allPass",
  "rollbacks",
  "safety",
]);
const ORIGINS_KEYS = new Set(["observedAt", "evidence"]);
const DEPLOYMENT_KEYS = new Set([
  "state",
  "target",
  "observedAt",
  "evidence",
]);
const ROW_KEYS = new Set(["id", "name", "result", "at", "evidence"]);
const ROLLBACK_KEYS = new Set(["result", "at", "evidence"]);
const SAFETY_KEYS = new Set([
  "productionEventsCreated",
  "secretCookieTokenCaptured",
  "destructiveRestorePerformed",
  "preEmbargoMutationPerformed",
]);

const SENSITIVE_PATTERNS = [
  {
    label: "authorization bearer value",
    pattern:
      /authorization\s*:\s*bearer\s+(?!<redacted>|\[redacted\]|redacted\b)[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "cookie value",
    pattern:
      /(?:set-cookie|cookie)\s*:\s*(?![^\r\n]*(?:<redacted>|\[redacted\]|redacted\b))[^\s;=]+=[^;\s]{8,}/i,
  },
  {
    label: "secret or token assignment",
    pattern:
      /(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token)\s*[:=]\s*["']?(?!<redacted>|\[redacted\]|redacted\b)[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "provider token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|vercel_[A-Za-z0-9_-]{20,})\b/i,
  },
  {
    label: "JWT value",
    pattern:
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

const PROHIBITED_EVIDENCE_PATTERNS = [
  {
    label: "production event creation is forbidden",
    pattern:
      /(?:created|inserted|posted|triggered)\s+(?:an?\s+)?(?:arbitrary\s+)?production\s+(?:alert\s+)?event/i,
  },
  {
    label: "production event creation is forbidden",
    pattern: /(?:curl\b[^\r\n]*\s-X\s*POST|POST)\s+[^\r\n]*\/api\/v1\/events\b/i,
  },
  {
    label: "destructive restore is forbidden",
    pattern: /(?:destructive\s+restore|database\s+restore)\s+(?:completed|performed|executed)/i,
  },
  {
    label: "pre-embargo mutation is forbidden",
    pattern: /pre[- ]embargo\s+(?:production\s+)?mutation\s+(?:completed|performed|executed)/i,
  },
];

class ProductReadyError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    errors.push(`${label} has unknown fields: ${unknown.join(", ")}`);
  }
  return true;
}

function formatValue(value) {
  if (value === "") return "empty";
  return JSON.stringify(value);
}

function parseTimestamp(value, label, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be an ISO-8601 timestamp`);
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    errors.push(`${label} must be an ISO-8601 timestamp`);
    return undefined;
  }
  return parsed;
}

function validateFreshObservation(value, label, nowMs, errors) {
  const observedMs = parseTimestamp(value, `${label} observedAt`, errors);
  if (observedMs === undefined) return;
  if (observedMs > nowMs + MAX_FUTURE_SKEW_MS) {
    errors.push(`${label} observation is more than 5 minutes in the future`);
  } else if (nowMs - observedMs > MAX_OBSERVATION_AGE_MS) {
    errors.push(`${label} observation is stale; maximum age is 24 hours`);
  }
}

function validateOrigin(value, label, artifactKind, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be a non-empty HTTPS origin`);
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${label} must be a valid HTTPS origin`);
    return;
  }

  if (parsed.protocol !== "https:") {
    if (label === "apiOrigin") {
      errors.push("apiOrigin must use HTTPS; HTTP would create mixed content");
    } else {
      errors.push("frontOrigin must use HTTPS");
    }
    return;
  }
  if (parsed.origin !== value || parsed.username || parsed.password) {
    errors.push(`${label} must be a canonical origin without path, query, hash, or userinfo`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) {
    errors.push(`${label} must use a custom HTTPS domain; vercel.app is forbidden`);
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    !hostname.includes(".") ||
    hostname.includes("*") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    errors.push(`${label} must use a production custom domain, not localhost or an IP address`);
  }

  if (artifactKind === "production") {
    const expected =
      label === "frontOrigin" ? PRODUCTION_FRONT_ORIGIN : PRODUCTION_API_ORIGIN;
    if (value !== expected) {
      errors.push(`${label} must equal the approved production origin ${expected}`);
    }
  } else if (!hostname.endsWith(".test")) {
    errors.push(`${label} for a synthetic artifact must use the reserved .test suffix`);
  }
}

function scanSensitiveText(text, label, errors) {
  for (const candidate of SENSITIVE_PATTERNS) {
    if (candidate.pattern.test(text)) {
      errors.push(`sensitive credential pattern found in ${label}: ${candidate.label}`);
    }
  }
  for (const candidate of PROHIBITED_EVIDENCE_PATTERNS) {
    if (candidate.pattern.test(text)) {
      errors.push(`${label} proves a forbidden action: ${candidate.label}`);
    }
  }
}

function markdownSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function fragmentResolves(content, fragment) {
  if (!fragment) return true;
  let decoded;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    return false;
  }
  if (content.includes(`id="${decoded}"`) || content.includes(`id='${decoded}'`)) {
    return true;
  }
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading && markdownSlug(heading[1]) === decoded) return true;
  }
  return false;
}

function validateEvidenceReference(reference, label, artifactDirectory, errors) {
  if (typeof reference !== "string" || reference.trim() === "") {
    errors.push(`${label} must be a non-empty relative reference`);
    return;
  }
  if (
    isAbsolute(reference) ||
    reference.startsWith("file:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    errors.push(`${label} must be a local relative reference`);
    return;
  }

  const [pathPart, fragment = ""] = reference.split("#", 2);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathPart);
  } catch {
    errors.push(`${label} has invalid percent encoding`);
    return;
  }
  const resolved = resolve(artifactDirectory, decodedPath);
  const pathFromRoot = relative(artifactDirectory, resolved);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    errors.push(`${label} must resolve inside the artifact directory`);
    return;
  }

  let fileStat;
  try {
    if (lstatSync(resolved).isSymbolicLink()) {
      errors.push(`${label} must not resolve through a symbolic link`);
      return;
    }
    fileStat = statSync(resolved);
  } catch {
    errors.push(`${label} does not resolve: ${reference}`);
    return;
  }
  if (!fileStat.isFile() || fileStat.size === 0) {
    errors.push(`${label} must resolve to a non-empty regular file`);
    return;
  }
  if (fileStat.size > MAX_SCANNED_EVIDENCE_BYTES) {
    errors.push(`${label} exceeds the 5 MiB redaction scan limit`);
    return;
  }

  const realArtifactDirectory = realpathSync(artifactDirectory);
  const realEvidence = realpathSync(resolved);
  const realPathFromRoot = relative(realArtifactDirectory, realEvidence);
  if (
    realPathFromRoot === ".." ||
    realPathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(realPathFromRoot)
  ) {
    errors.push(`${label} resolves outside the artifact directory`);
    return;
  }

  const content = readFileSync(realEvidence).toString("utf8");
  if (!fragmentResolves(content, fragment)) {
    errors.push(`${label} fragment does not resolve: #${fragment}`);
  }
  scanSensitiveText(content, label, errors);
}

function validateSafety(safety, errors) {
  if (!rejectUnknownKeys(safety, SAFETY_KEYS, "safety", errors)) return;
  const labels = {
    productionEventsCreated: "production event creation is forbidden",
    secretCookieTokenCaptured: "secret, cookie, or token capture is forbidden",
    destructiveRestorePerformed: "destructive restore is forbidden",
    preEmbargoMutationPerformed: "pre-embargo mutation is forbidden",
  };
  for (const key of SAFETY_KEYS) {
    if (safety[key] !== false) {
      errors.push(`${labels[key]}; safety.${key} must be false`);
    }
  }
}

function validateProductionTimestamp(timestampMs, label, errors) {
  if (timestampMs !== undefined && timestampMs < EMBARGO_END_MS) {
    errors.push(`${label} predates the production mutation embargo end`);
  }
}

export function validateProductReadyArtifact(
  artifact,
  { artifactPath, allowSynthetic = false, now = new Date() },
) {
  const errors = [];
  const artifactDirectory = dirname(resolve(artifactPath));

  if (!rejectUnknownKeys(artifact, ROOT_KEYS, "artifact", errors)) {
    throw new ProductReadyError(errors);
  }
  if (artifact.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }
  if (artifact.gate !== "PRODUCT_READY") {
    errors.push('gate must equal "PRODUCT_READY"');
  }
  if (!new Set(["production", "synthetic"]).has(artifact.artifactKind)) {
    errors.push('artifactKind must be "production" or "synthetic"');
  } else if (artifact.artifactKind === "synthetic" && !allowSynthetic) {
    errors.push("synthetic artifacts require the explicit --allow-synthetic flag");
  }

  validateOrigin(artifact.frontOrigin, "frontOrigin", artifact.artifactKind, errors);
  validateOrigin(artifact.apiOrigin, "apiOrigin", artifact.artifactKind, errors);

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("now must be a valid Date");
  }

  if (rejectUnknownKeys(artifact.origins, ORIGINS_KEYS, "origins", errors)) {
    validateFreshObservation(
      artifact.origins.observedAt,
      "domain",
      nowMs,
      errors,
    );
    const originsAt = parseTimestamp(
      artifact.origins.observedAt,
      "origins observedAt",
      [],
    );
    if (artifact.artifactKind === "production") {
      validateProductionTimestamp(originsAt, "domain observation", errors);
    }
    validateEvidenceReference(
      artifact.origins.evidence,
      "origins evidence",
      artifactDirectory,
      errors,
    );
  }

  if (
    !/^[0-9a-f]{40}$/.test(artifact.deploymentSha ?? "") ||
    (artifact.artifactKind === "production" && /^0{40}$/.test(artifact.deploymentSha))
  ) {
    errors.push(
      "deploymentSha must be a live 40-character lowercase hex revision",
    );
  }
  if (
    rejectUnknownKeys(
      artifact.deployment,
      DEPLOYMENT_KEYS,
      "deployment",
      errors,
    )
  ) {
    if (artifact.deployment.state !== "READY") {
      errors.push('deployment state must equal "READY"');
    }
    if (artifact.deployment.target !== "production") {
      errors.push('deployment target must equal "production"');
    }
    validateFreshObservation(
      artifact.deployment.observedAt,
      "deployment",
      nowMs,
      errors,
    );
    const deploymentAt = parseTimestamp(
      artifact.deployment.observedAt,
      "deployment observedAt",
      [],
    );
    if (artifact.artifactKind === "production") {
      validateProductionTimestamp(deploymentAt, "deployment observation", errors);
    }
    validateEvidenceReference(
      artifact.deployment.evidence,
      "deployment evidence",
      artifactDirectory,
      errors,
    );
  }

  let rows = [];
  if (!Array.isArray(artifact.rows)) {
    errors.push("rows must be an array");
  } else {
    rows = artifact.rows;
  }

  const counts = new Map();
  for (const row of rows) {
    if (isObject(row) && Number.isInteger(row.id)) {
      counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    }
  }
  const duplicateIds = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left - right);
  const missingIds = ROW_IDS.filter((id) => !counts.has(id));
  const outOfRangeIds = [...counts.keys()]
    .filter((id) => id < 1 || id > 24)
    .sort((left, right) => left - right);
  if (duplicateIds.length || missingIds.length || outOfRangeIds.length) {
    const details = [];
    if (duplicateIds.length) details.push(`duplicate IDs: ${duplicateIds.join(", ")}`);
    if (missingIds.length) details.push(`missing IDs: ${missingIds.join(", ")}`);
    if (outOfRangeIds.length) {
      details.push(`out-of-range IDs: ${outOfRangeIds.join(", ")}`);
    }
    errors.push(`row IDs invalid: ${details.join("; ")}`);
  }

  for (const [index, row] of rows.entries()) {
    const fallbackLabel = `row at index ${index}`;
    if (!rejectUnknownKeys(row, ROW_KEYS, fallbackLabel, errors)) continue;
    const label = Number.isInteger(row.id) ? `row ${row.id}` : fallbackLabel;
    if (!Number.isInteger(row.id) || row.id < 1 || row.id > 24) {
      errors.push(`${label} id must be an integer from 1 through 24`);
    }
    if (typeof row.name !== "string" || row.name.trim() === "") {
      errors.push(`${label} name must be non-empty`);
    }
    if (!RESULT_VALUES.has(row.result)) {
      errors.push(
        `${label} result must be PASS or FAIL, got ${formatValue(row.result)}`,
      );
    }
    const rowAt = parseTimestamp(row.at, `${label} at`, errors);
    if (artifact.artifactKind === "production") {
      validateProductionTimestamp(rowAt, `${label} observation`, errors);
    }
    validateEvidenceReference(
      row.evidence,
      `${label} evidence`,
      artifactDirectory,
      errors,
    );
  }

  const recomputedAllPass =
    rows.length === 24 &&
    missingIds.length === 0 &&
    duplicateIds.length === 0 &&
    outOfRangeIds.length === 0 &&
    rows.every((row) => isObject(row) && row.result === "PASS");
  if (artifact.allPass !== recomputedAllPass) {
    errors.push(
      `allPass mismatch: declared ${formatValue(artifact.allPass)}, recomputed ${recomputedAllPass}`,
    );
  }
  if (!recomputedAllPass && artifact.allPass === false) {
    errors.push("every PRODUCT_READY row must be PASS");
  }

  const rollbackPlanesPass = [];
  if (artifact.rollbacks !== undefined) {
    if (!rejectUnknownKeys(artifact.rollbacks, new Set(["frontend", "host"]), "rollbacks", errors)) {
      // The object error is enough.
    } else {
      for (const plane of ["frontend", "host"]) {
        const receipt = artifact.rollbacks[plane];
        if (receipt === undefined) continue;
        if (!isObject(receipt)) {
          errors.push(`${plane} rollback plane must be an object`);
          continue;
        }
        rejectUnknownKeys(receipt, ROLLBACK_KEYS, `${plane} rollback plane`, errors);
        if (!RESULT_VALUES.has(receipt.result)) {
          errors.push(
            `${plane} rollback plane result must be PASS or FAIL, got ${formatValue(receipt.result)}`,
          );
        } else if (receipt.result === "PASS") {
          rollbackPlanesPass.push(plane);
        }
        const rollbackAt = parseTimestamp(
          receipt.at,
          `${plane} rollback plane at`,
          errors,
        );
        if (artifact.artifactKind === "production") {
          validateProductionTimestamp(
            rollbackAt,
            `${plane} rollback observation`,
            errors,
          );
        }
        validateEvidenceReference(
          receipt.evidence,
          `${plane} rollback evidence`,
          artifactDirectory,
          errors,
        );
      }
    }
  }

  validateSafety(artifact.safety, errors);
  scanSensitiveText(JSON.stringify(artifact), "artifact", errors);

  if (errors.length > 0) {
    throw new ProductReadyError([...new Set(errors)]);
  }

  return {
    valid: true,
    gate: artifact.gate,
    artifactKind: artifact.artifactKind,
    rowCount: rows.length,
    recomputedAllPass,
    rollbackPlanesPass,
    frontOrigin: artifact.frontOrigin,
    apiOrigin: artifact.apiOrigin,
    deploymentSha: artifact.deploymentSha,
  };
}

function parseArgs(argv) {
  let allowSynthetic = false;
  let artifactPath;
  for (const arg of argv) {
    if (arg === "--allow-synthetic") {
      allowSynthetic = true;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (artifactPath) {
      throw new Error("exactly one artifact path is required");
    } else {
      artifactPath = arg;
    }
  }
  if (!artifactPath) throw new Error("an artifact path is required");
  return { allowSynthetic, artifactPath, help: false };
}

function usage() {
  return `Usage: node scripts/release/check-product-ready.mjs [--allow-synthetic] <artifact.json>\n\n--allow-synthetic validates contract fixtures only; it can never validate a production artifact disguised with non-production domains.\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(options.artifactPath, "utf8"));
  } catch (error) {
    throw new ProductReadyError([`artifact JSON is unreadable or malformed: ${error.message}`]);
  }
  const result = validateProductReadyArtifact(artifact, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  try {
    main();
  } catch (error) {
    if (error instanceof ProductReadyError) {
      process.stderr.write("PRODUCT_READY INVALID\n");
      for (const issue of error.errors) process.stderr.write(`- ${issue}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`${error.message}\n\n${usage()}`);
      process.exitCode = 1;
    }
  }
}
