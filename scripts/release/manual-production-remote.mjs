export function assertDbMode(options) {
  const allowedModes = new Set(["migrate", "baseline-existing", "reset-demo", "skip"]);
  if (!allowedModes.has(options.dbMode)) {
    throw new Error(`Invalid --db-mode: ${options.dbMode}.`);
  }
  if (options.dbMode === "baseline-existing" && !options.allowBaselineExisting) {
    throw new Error("--db-mode baseline-existing requires --allow-baseline-existing.");
  }
  if (options.dbMode === "reset-demo" && !options.allowDestructiveReset) {
    throw new Error("--db-mode reset-demo requires --allow-destructive-reset.");
  }
}

export function packageAndDeploy({
  actor,
  allowBaselineExisting,
  allowDestructiveReset,
  backupDir,
  capture,
  dbMode,
  dryRun,
  formatCommand,
  host,
  imageNamespace,
  quoteShell,
  run,
  sha,
  sshKey,
  user,
}) {
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

  const deployEnv = [
    `IMAGE_NAMESPACE=${quoteShell(imageNamespace)}`,
    `IMAGE_TAG=${quoteShell(sha)}`,
    `DEPLOY_DB_MODE=${quoteShell(dbMode)}`,
  ];
  if (allowBaselineExisting) deployEnv.push("ALLOW_PRISMA_BASELINE='1'");
  if (allowDestructiveReset) {
    deployEnv.push("ALLOW_DESTRUCTIVE_DB_RESET='I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA'");
  }
  if (backupDir) deployEnv.push(`BACKUP_DIR=${quoteShell(backupDir)}`);

  const remoteCommand = [
    "install -d -m 700 /opt/eldercare-fall-ai/shared",
    "rm -rf /opt/eldercare-fall-ai/current",
    "install -d -m 755 /opt/eldercare-fall-ai/current",
    "tar -xzf /tmp/eldercare-deploy-bundle.tgz -C /opt/eldercare-fall-ai/current",
    "rm -f /tmp/eldercare-deploy-bundle.tgz",
    "chmod +x /tmp/ncloud-deploy.sh",
    `${deployEnv.join(" ")} /tmp/ncloud-deploy.sh`,
  ].join(" && ");

  run("ssh", [...sshArgs, remoteCommand], { dryRun });
}
