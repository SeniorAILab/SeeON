#!/usr/bin/env node

import { isDeepStrictEqual } from "node:util";
import { spawn } from "node:child_process";

function usage() {
  return `Usage:
  node scripts/release/await-exact-signal.mjs \\
    --timeout-ms <milliseconds> \\
    --ready-json '<exact JSON object>' \\
    --signal-json '<exact JSON object>' \\
    --subscribe-command '<NDJSON event stream command>' \\
    [--trigger-command '<command run only after ready-json>']

The subscription command must emit one JSON object per line. The helper starts it,
requires the exact ready object, then runs the optional trigger and succeeds only
on the exact target object. The single deadline covers readiness and completion.
`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") return { help: true };
    if (
      !new Set([
        "--timeout-ms",
        "--ready-json",
        "--signal-json",
        "--subscribe-command",
        "--trigger-command",
      ]).has(key)
    ) {
      throw new Error(`unknown option: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
    index += 1;
  }

  for (const key of [
    "timeout-ms",
    "ready-json",
    "signal-json",
    "subscribe-command",
  ]) {
    if (!options[key]) throw new Error(`--${key} is required`);
  }
  const timeoutMs = Number(options["timeout-ms"]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) {
    throw new Error("--timeout-ms must be an integer from 1 through 3600000");
  }

  let ready;
  let signal;
  try {
    ready = JSON.parse(options["ready-json"]);
    signal = JSON.parse(options["signal-json"]);
  } catch (error) {
    throw new Error(`ready/signal JSON must parse: ${error.message}`);
  }
  if (!ready || typeof ready !== "object" || Array.isArray(ready)) {
    throw new Error("--ready-json must be a JSON object");
  }
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    throw new Error("--signal-json must be a JSON object");
  }

  return {
    help: false,
    ready,
    signal,
    subscribeCommand: options["subscribe-command"],
    triggerCommand: options["trigger-command"],
    timeoutMs,
  };
}

function spawnShell(command, stdio) {
  return spawn("/bin/sh", ["-c", command], {
    env: process.env,
    stdio,
  });
}

async function awaitExactSignal(options) {
  const subscriber = spawnShell(options.subscribeCommand, [
    "ignore",
    "pipe",
    "inherit",
  ]);
  let trigger;
  let settled = false;
  let readySeen = false;
  let buffer = "";

  const cleanup = () => {
    if (subscriber.exitCode === null) subscriber.kill("SIGTERM");
    if (trigger?.exitCode === null) trigger.kill("SIGTERM");
  };

  return new Promise((resolvePromise, rejectPromise) => {
    const finish = (error, event) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      cleanup();
      if (error) rejectPromise(error);
      else resolvePromise(event);
    };

    const deadline = setTimeout(() => {
      finish(
        new Error(
          `exact signal deadline exceeded after ${options.timeoutMs}ms (${readySeen ? "target" : "subscription readiness"})`,
        ),
      );
    }, options.timeoutMs);

    const startTrigger = () => {
      if (!options.triggerCommand) return;
      trigger = spawnShell(options.triggerCommand, ["ignore", "inherit", "inherit"]);
      trigger.once("error", (error) => finish(error));
      trigger.once("exit", (code, signal) => {
        if (code !== 0) {
          finish(
            new Error(
              `trigger command exited before the exact signal (code=${code}, signal=${signal ?? "none"})`,
            ),
          );
        }
      });
    };

    const processEvent = (line) => {
      if (line.trim() === "") return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        finish(new Error("subscription emitted malformed NDJSON (content suppressed)"));
        return;
      }
      if (!readySeen) {
        if (!isDeepStrictEqual(event, options.ready)) {
          finish(new Error("subscription emitted a non-matching readiness signal"));
          return;
        }
        readySeen = true;
        startTrigger();
        return;
      }
      if (isDeepStrictEqual(event, options.signal)) finish(undefined, event);
    };

    subscriber.stdout.setEncoding("utf8");
    subscriber.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processEvent(line);
      }
    });
    subscriber.once("error", (error) => finish(error));
    subscriber.once("exit", (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `subscription ended before the exact signal (code=${code}, signal=${signal ?? "none"})`,
          ),
        );
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const event = await awaitExactSignal(options);
  process.stdout.write(`${JSON.stringify({ matched: true, event })}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}`);
  process.exitCode = 1;
}
