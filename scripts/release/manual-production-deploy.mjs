#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const usage = `Usage:
  pnpm deploy:prod:manual -- <ref> [--host <host>] [--user <user>] [--ssh-key <path>] [--namespace <image-namespace>] [--platform <platform>] [--dry-run]

Builds/pushes SHA-pinned production images locally, then deploys the pull-only
Naver Cloud VM stack. Use only when the normal GitHub Actions deploy cannot run.

`;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    host: "101.79.18.95",
    imageNamespace: "ghcr.io/goberomsu/eldercare-fall-ai",
    imagePlatform: "linux/amd64",
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
    if (arg === "--platform") {
      options.imagePlatform = readValue(argv, index, arg);
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
  try {
    return capture("gh", ["api", "user", "--jq", ".login"]);
  } catch {
    return "GoBeromsu";
  }
}

function buildAndPushImages({ imageNamespace, imagePlatform, sha, dryRun }) {
  const backendImage = `${imageNamespace}/backend:${sha}`;
  const frontImage = `${imageNamespace}/front:${sha}`;
  const buildBase = ["build", "--platform", imagePlatform, "--target", "runner"];

  run("docker", [...buildBase, "-f", "backend/Dockerfile", "-t", backendImage, "."], {
    dryRun,
  });
  run("docker", ["push", backendImage], { dryRun });
  run(
    "docker",
    [
      ...buildBase,
      "-f",
      "front/Dockerfile",
      "--build-arg",
      "VITE_USE_MOCK=false",
      "--build-arg",
      "VITE_API_BASE_URL=/api",
      "-t",
      frontImage,
      ".",
    ],
    { dryRun },
  );
  run("docker", ["push", frontImage], { dryRun });
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

function packageAndDeploy({ actor, dryRun, host, imageNamespace, sha, sshKey, user }) {
  const remote = `${user}@${host}`;
  const bundle = `/tmp/eldercare-deploy-bundle-${sha}.tgz`;
  const sshArgs = ["-i", sshKey, remote];
  const scpBaseArgs = ["-i", sshKey];

  run("tar", ["-czf", bundle, "compose.yaml", "compose.prod.yaml", "backend/prisma"], { dryRun });
  run("scp", [...scpBaseArgs, "scripts/deploy/ncloud-deploy.sh", `${remote}:/tmp/ncloud-deploy.sh`], { dryRun });
  run("scp", [...scpBaseArgs, bundle, `${remote}:/tmp/eldercare-deploy-bundle.tgz`], { dryRun });

  if (dryRun) {
    process.stdout.write(
      `gh auth token | ${formatCommand("ssh", [...sshArgs, `docker login ghcr.io -u ${quoteShell(actor)} --password-stdin`])}\n`,
    );
  } else {
    const token = capture("gh", ["auth", "token"]);
    run("ssh", [...sshArgs, `docker login ghcr.io -u ${quoteShell(actor)} --password-stdin`], {
      input: token,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }

  const remoteCommand = [
    "install -d -m 700 /opt/eldercare-fall-ai/shared",
    "rm -rf /opt/eldercare-fall-ai/current",
    "install -d -m 755 /opt/eldercare-fall-ai/current",
    "tar -xzf /tmp/eldercare-deploy-bundle.tgz -C /opt/eldercare-fall-ai/current",
    "rm -f /tmp/eldercare-deploy-bundle.tgz",
    "chmod +x /tmp/ncloud-deploy.sh",
    `IMAGE_NAMESPACE=${quoteShell(imageNamespace)} IMAGE_TAG=${quoteShell(sha)} /tmp/ncloud-deploy.sh`,
  ].join(" && ");

  run("ssh", [...sshArgs, remoteCommand], { dryRun });
}

function assertLocalInputs(options) {
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

  process.stdout.write(`Manual production deploy ref=${ref} sha=${sha}\nNormal path remains GitHub Release -> Deploy Naver Cloud workflow.\nThis path builds locally, pushes GHCR SHA tags, then the VM pulls only.\nImage platform=${checkedOptions.imagePlatform}\n`);

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
    imagePlatform: checkedOptions.imagePlatform,
    sha,
  });
  packageAndDeploy({
    actor,
    dryRun: checkedOptions.dryRun,
    host: checkedOptions.host,
    imageNamespace: checkedOptions.imageNamespace,
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
