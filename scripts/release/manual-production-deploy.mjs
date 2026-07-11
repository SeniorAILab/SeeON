#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildAndPushImages } from "./manual-production-images.mjs";
import { assertDbMode, packageAndDeploy } from "./manual-production-remote.mjs";

const usage = `Usage:
  pnpm deploy:prod:manual -- <ref> [--host <host>] [--user <user>] [--ssh-key <path>] [--namespace <image-namespace>] [--db-mode migrate|baseline-existing|reset-demo|skip] [--allow-baseline-existing] [--allow-destructive-reset] [--backup-dir <path>] [--dry-run]

Builds/pushes the two same-SHA production images locally (backend, front), then
deploys the pull-only Naver Cloud host VM stack. This is the current production
deploy path while Actions-backed CD is paused.

`;

function parseArgs(argv) {
  const options = {
    allowBaselineExisting: false,
    allowDestructiveReset: false,
    backupDir: undefined,
    dbMode: "migrate",
    dryRun: false,
    host: "<retired-host>",
    imageNamespace: "ghcr.io/seniorailab/eldercare-fall-ai",
    sshKey: "~/.ssh/eldercare-fall-ai-ncloud",
    user: "deploy",
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      return { help: true, options, ref: undefined };
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--allow-baseline-existing") {
      options.allowBaselineExisting = true;
      continue;
    }
    if (arg === "--allow-destructive-reset") {
      options.allowDestructiveReset = true;
      continue;
    }
    if (arg === "--db-mode") {
      options.dbMode = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--backup-dir") {
      options.backupDir = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--host") {
      options.host = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--user") {
      options.user = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--ssh-key") {
      options.sshKey = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--namespace") {
      options.imageNamespace = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new Error("Exactly one deploy ref is required.");
  }

  return { help: false, options, ref: positionals[0] };
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function run(command, args, options = {}) {
  if (options.dryRun) {
    process.stdout.write(formatCommand(command, args) + "\n");
    return { stdout: "" };
  }

  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    stdio: options.stdio ?? "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.`);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}${stderr ? `: ${stderr}` : ""}.`,
    );
  }
  return result.stdout.trim();
}

function quoteShell(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteShell).join(" ");
}

function expandHome(path) {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function resolveDeploySha(ref) {
  const sha = capture("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`Resolved ref ${ref} to invalid SHA: ${sha}`);
  }
  return sha;
}

function resolveGithubActor() {
  return capture("gh", ["api", "user", "--jq", ".login"]);
}

function ensureSshKnownHost(host, dryRun) {
  const sshDir = join(homedir(), ".ssh");
  const knownHosts = join(sshDir, "known_hosts");

  if (dryRun) {
    process.stdout.write(`ssh-keygen -F ${quoteShell(host)} || ssh-keyscan -H ${quoteShell(host)} >> ${quoteShell(knownHosts)}\n`);
    return;
  }

  mkdirSync(sshDir, { mode: 0o700, recursive: true });
  const known = spawnSync("ssh-keygen", ["-F", host], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (known.status === 0) return;

  const scan = capture("ssh-keyscan", ["-H", host]);
  appendFileSync(knownHosts, `${scan}\n`, { mode: 0o600 });
}

function assertLocalInputs(options) {
  assertDbMode(options);
  const sshKey = expandHome(options.sshKey);
  if (!options.dryRun && !existsSync(sshKey)) {
    throw new Error(`SSH key does not exist: ${sshKey}`);
  }
  return { ...options, sshKey };
}

function main() {
  const { help, options, ref } = parseArgs(process.argv.slice(2));
  if (help) return process.stdout.write(usage);

  const checkedOptions = assertLocalInputs(options);
  const sha = resolveDeploySha(ref);
  const actor = resolveGithubActor();

  process.stdout.write(`Manual production deploy ref=${ref} sha=${sha}\nCurrent production path: local build/push of two GHCR SHA tags, then VM pull-only host deploy.\nActions-backed CD is paused but preserved for later re-enable.\nDB mode=${checkedOptions.dbMode}\n`);

  run("gh", ["auth", "status"], { dryRun: checkedOptions.dryRun });
  run("docker", ["version"], { dryRun: checkedOptions.dryRun });
  ensureSshKnownHost(checkedOptions.host, checkedOptions.dryRun);

  if (checkedOptions.dryRun) {
    process.stdout.write("gh auth token | docker login ghcr.io --username <github-user> --password-stdin\n");
  } else {
    const token = capture("gh", ["auth", "token"]);
    run("docker", ["login", "ghcr.io", "--username", actor, "--password-stdin"], {
      input: token,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }

  buildAndPushImages({
    dryRun: checkedOptions.dryRun,
    imageNamespace: checkedOptions.imageNamespace,
    run,
    sha,
  });
  packageAndDeploy({
    actor,
    allowBaselineExisting: checkedOptions.allowBaselineExisting,
    allowDestructiveReset: checkedOptions.allowDestructiveReset,
    backupDir: checkedOptions.backupDir,
    capture,
    dbMode: checkedOptions.dbMode,
    dryRun: checkedOptions.dryRun,
    formatCommand,
    host: checkedOptions.host,
    imageNamespace: checkedOptions.imageNamespace,
    quoteShell,
    run,
    sha,
    sshKey: checkedOptions.sshKey,
    user: checkedOptions.user,
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage}`);
  process.exit(1);
}
