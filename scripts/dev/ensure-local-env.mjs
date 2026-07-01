#!/usr/bin/env node
import {
  LocalEnvError,
  loadAndValidateLocalEnv,
  parseCommonArgs,
  printLocalEnvSummary,
} from './local-env.mjs';

async function main() {
  const { envFile } = parseCommonArgs(process.argv.slice(2));
  const { summary } = await loadAndValidateLocalEnv(envFile);
  printLocalEnvSummary(summary);
}

main().catch((error) => {
  if (error instanceof LocalEnvError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
