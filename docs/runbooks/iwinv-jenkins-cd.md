# iwinv Jenkins CD runbook

## Scope and ownership

This is the production CD path for backend and frontend only. ML remains edge-only
and is never built, deployed, or restarted here.

- Jenkins operator URL (Tailscale only): `https://seniorsailab-314580.tail9eb061.ts.net/`
- Jenkins webhook ingress: `http://49.247.204.81/generic-webhook-trigger/invoke`
- Repository checkout: `/opt/eldercare-fall-ai/repo`
- Production environment: `/opt/eldercare-fall-ai/shared/.env`
- Images: `eldercare-backend:<sha>` and `eldercare-front:<sha>`, where `<sha>` is
  exactly 40 lowercase hexadecimal characters.
- Public frontend: Caddy proxies to `127.0.0.1:3000`; backend and PostgreSQL remain
  internal to the Compose network.

Jenkins is the only server-side builder and normal deploy initiator. It validates
`SHA` and `REF`, fetches `origin/main`, builds the two exact SHA-tagged images, and
runs `sh scripts/deploy/iwinv-deploy.sh --sha "$SHA"`. It has no `latest`, inferred
ref, retry, fallback, or automatic rollback behavior; direct host use is limited to
the explicit rollback and restore procedures below.

## Required configuration

1. Configure the Jenkins pipeline job from this repository's `Jenkinsfile`. The job
   must accept string parameters `SHA` and `REF` and run on the iwinv Jenkins host.
2. Store the webhook bearer token in Jenkins as a secret-text credential with ID
   `eldercare-webhook-token`. Do not place its value in the job configuration,
   console output, or this repository.
3. Store the same token in GitHub Actions repository secret
   `WEBHOOK_TOKEN`. The trigger sends `Authorization: Bearer <token>`;
   it does not use a query-string token.
4. Populate `/opt/eldercare-fall-ai/shared/.env` from the tracked production env
   contract using host-local secret management. Keep it readable only by the deploy
   service account and do not print it.
5. Keep GitHub Actions repository variable `DEPLOY_ENABLED` unset or not equal to
   `true` during setup and the first manual deployment. This is disabled by default.

## First deployment and enablement

1. In Jenkins at the Tailscale URL, use **Build with Parameters**. Set `SHA` to the
   reviewed `main` commit's full 40-character lowercase SHA and set `REF` to
   `refs/heads/main`. Start the build manually.
2. Read the Jenkins console through completion. A failure at checkout, build,
   preflight, backup, migration, Compose startup, or health verification is terminal;
   diagnose and start a new manual build only after correction.
3. On the host, confirm the exact version and internal service state:

   ```sh
   cd /opt/eldercare-fall-ai/repo
   curl --fail --silent http://127.0.0.1:3000/version.txt
   docker compose --env-file /opt/eldercare-fall-ai/shared/.env \
     --env-file /opt/eldercare-fall-ai/shared/release-images.env \
     -f compose.yaml -f compose.prod.yaml ps
   ```

   The first command must return exactly the requested SHA. The stack must show only
   loopback exposure for `front`; it must not publish backend or database ports.
4. From an external network, set `PUBLIC_URL` to the non-secret Caddy URL matching
   `FRONT_ORIGIN`, then check it without disclosing credentials:

   ```sh
   PUBLIC_URL='http://49.247.204.81'
   curl --fail --show-error --location --head "$PUBLIC_URL"
   curl --fail --show-error --location "$PUBLIC_URL/version.txt"
   ```

   The public version response must match the deployed SHA. TLS is deferred in issue
   #587. Confirm the firewall exposes only Caddy's public HTTP port; direct `:3000`,
   `:8080`, and `:5432` must remain closed.
5. After all checks pass, set GitHub repository variable `DEPLOY_ENABLED` to `true`.
   Successful CI for `main` then posts the exact workflow SHA and
   `REF=refs/heads/main` to Jenkins. Set the variable back to any other value to
   stop future triggers.

## Backup, rollback, and restore

Every normal deployment first creates a compressed PostgreSQL dump under
`/opt/eldercare-fall-ai/backups/db/` with `pg_dump -Fc`, then verifies it with
`pg_restore --list` before migration. The deploy script retains recent normal dumps
and records a baseline dump on its first successful run. Before a planned risky
change, preserve an additional copy outside the host using approved encrypted backup
storage and verify it with `pg_restore --list` before relying on it.

Inspect manifests and backup candidates without viewing environment data:

```sh
cd /opt/eldercare-fall-ai/repo
ls -l /opt/eldercare-fall-ai/releases/
ls -l /opt/eldercare-fall-ai/backups/db/
```

Rollback deploys the recorded exact image pair. It does not restore database data:

```sh
cd /opt/eldercare-fall-ai/repo
sh scripts/deploy/iwinv-deploy.sh --rollback
# Or select a previously recorded release SHA:
sh scripts/deploy/iwinv-deploy.sh --rollback <40-lowercase-hex-sha>
```

Database restoration is destructive and requires an explicit acknowledgement. Stop
and assess application/schema compatibility before running it:

```sh
cd /opt/eldercare-fall-ai/repo
sh scripts/deploy/iwinv-deploy.sh --restore-db \
  /opt/eldercare-fall-ai/backups/db/<dump>.dump --ack-data-loss
```

To restore the dump associated with an explicit rollback release and deploy its code:

```sh
sh scripts/deploy/iwinv-deploy.sh --rollback <40-lowercase-hex-sha> \
  --restore-db /opt/eldercare-fall-ai/backups/db/<dump>.dump --ack-data-loss
```

After rollback or restore, repeat the internal and public exposure checks above.

## Failure-point matrix

| Failure point | Detection | Operator action |
| --- | --- | --- |
| Checkout | Jenkins rejects `SHA`/`REF`, cannot fetch `origin/main`, or checked-out commit differs from `SHA`. | Correct the reviewed full SHA/ref or Jenkins repository access; start a new manual build. Do not substitute a branch or fallback SHA. |
| Build | Jenkins Docker build fails or an exact image tag is absent. | Correct the build failure; rebuild only through Jenkins with the same validated SHA. Do not build on an operator machine or use `latest`. |
| Preflight | Deploy log reports insufficient memory/disk or missing root, Compose files, or env file. | Restore host capacity or required host-local configuration, then rerun manually. Do not bypass preflight. |
| Backup | `pg_dump` fails or `pg_restore --list` validation fails. | Preserve the failed dump for diagnosis, repair database/storage access, and obtain a validated backup before retrying migration. |
| Migrate | `prisma migrate deploy` exits non-zero. | Stop deployment, inspect migration and database state, and choose an explicit restore/rollback plan. Do not use reset, `db push`, or app-start migration. |
| Up | `docker compose up --wait` fails for backend or frontend. | Inspect only relevant container status/logs, correct configuration or image defects, then run a new Jenkins deployment. |
| Health | Backend health/SHA/database check or `127.0.0.1:3000/version.txt` check fails. | Keep `DEPLOY_ENABLED` disabled, investigate the exact failed service, then explicitly roll back if needed and recheck public exposure. |
| Trigger | GitHub workflow is skipped because `DEPLOY_ENABLED` is not `true`, lacks `WEBHOOK_TOKEN`, or Jenkins rejects the bearer request. | Verify the gate, repository secret, Jenkins credential ID `eldercare-webhook-token`, endpoint reachability, and bearer scheme; manually deploy until corrected. Never log or rotate by exposing a token. |
