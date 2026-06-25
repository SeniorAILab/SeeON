# Naver Cloud VM deploy runbook

This deploys the host stack to the Naver Cloud Ubuntu VM through the registry-image host topology:

- public: `front` nginx on `:80`
- internal only: `backend` on `:8080`, `db` on `:5432`
- normal release images are built in GitHub Actions and pushed to GitHub Container Registry
- if Actions minutes are exhausted, an operator can build/push the same SHA-tagged images locally
- the VM only pulls images and runs Docker Compose

## VM

- Public IP: `101.79.18.95`
- Login key file: `/Users/beomsu/Downloads/seniorsailab.pem`
- OS: `ubuntu-24.04-base`

## One-time access

Naver Cloud's VPC server access flow uses the PEM file to get the initial administrator password in the console. After retrieving that password, SSH as `root`. Reference: [Naver Cloud Access Server guide](https://guide.ncloud-docs.com/docs/en/server-access-vpc).

```bash
chmod 600 /Users/beomsu/Downloads/seniorsailab.pem
ssh root@101.79.18.95
```

If direct public-key SSH fails, use the console action:

1. Server > Server.
2. Select `eldercare-fall-ai`.
3. Manage servers > Get admin password.
4. Upload `/Users/beomsu/Downloads/seniorsailab.pem`.
5. Use the shown password for `root@101.79.18.95`.

## Bootstrap

Create a deploy key on the local machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/eldercare-fall-ai-ncloud -C "eldercare-fall-ai ncloud deploy"
```

Run the bootstrap script on the VM as `root` from the local checkout:

```bash
ssh root@101.79.18.95 \
  "DEPLOY_PUBLIC_KEY='$(cat ~/.ssh/eldercare-fall-ai-ncloud.pub)' sh -s" \
  < scripts/deploy/ncloud-bootstrap.sh
```

The script installs Docker, enables SSH/Docker, creates a `deploy` user, creates `/opt/eldercare-fall-ai`, and adds a `2G` swapfile for the `1 GB` VM.

## Production environment

Create `/opt/eldercare-fall-ai/shared/.env` on the server, or store the same content as the GitHub secret `NCLOUD_ENV_FILE`.

```dotenv
POSTGRES_USER=fall
POSTGRES_PASSWORD=replace-with-random-db-password
POSTGRES_DB=fall_prod
APP_DB_USER=fall_app
APP_DB_PASSWORD=replace-with-random-app-db-password
DATABASE_URL=postgresql://fall_app:replace-with-url-encoded-app-db-password@db:5432/fall_prod?schema=public
DIRECT_URL=postgresql://fall:replace-with-url-encoded-db-password@db:5432/fall_prod?schema=public

FRONT_ORIGIN=http://101.79.18.95
KAKAO_REST_API_KEY=replace-with-kakao-rest-api-key
# Required only if Kakao Login Client Secret is enabled in Kakao Developers.
# KAKAO_CLIENT_SECRET=replace-with-kakao-client-secret
KAKAO_REDIRECT_URI=http://101.79.18.95/auth/kakao/callback
# Defaults to talk_message when omitted; add profile_nickname only after consent setup.
# KAKAO_SCOPES=talk_message
SESSION_JWT_SECRET=replace-with-at-least-32-random-chars
KAKAO_TOKEN_ENC_KEY=replace-with-64-hex-chars
ALERT_DASHBOARD_URL=http://101.79.18.95
AUTH_COOKIE_SECURE=false
DEMO_LOGIN_PASSWORD=replace-with-demo-admin-password
# After rhqjatn310@kakao logs in once, bind by exact DB kakaoId or email.
# DEMO_SUPER_ADMIN_KAKAO_ID=
# DEMO_SUPER_ADMIN_KAKAO_EMAIL=rhqjatn310@kakao
```

`AUTH_COOKIE_SECURE=false` is only for this temporary HTTP/IP deployment. Set it
back to `true` when the public origin moves behind HTTPS.

Generate local secret values:

```bash
openssl rand -hex 32  # SESSION_JWT_SECRET or KAKAO_TOKEN_ENC_KEY
openssl rand -base64 32  # POSTGRES_PASSWORD
```

If a database password contains URL-reserved characters such as `@`, `:`, `/`,
`#`, or `%`, percent-encode it in `DATABASE_URL` / `DIRECT_URL`. Keep
`APP_DB_USER=fall_app`; the Prisma migrations grant privileges to that fixed
runtime role.

## Production deploy

The current production path is local manual deploy. Create a release tag when
you want a durable promotion marker, then deploy that tag from the local
checkout. The GitHub Actions release trigger is paused to avoid spending private
repository Actions minutes on image builds; the workflow body is preserved for
later re-enable.

From a local checkout with Docker, `gh`, and SSH access:

```bash
pnpm deploy:prod:manual -- v0.1.0 --dry-run
pnpm deploy:prod:manual -- v0.1.0
```

The default DB path is non-destructive:

```bash
pnpm deploy:prod:manual -- v0.1.0 --db-mode migrate --dry-run
pnpm deploy:prod:manual -- v0.1.0 --db-mode migrate
```

`migrate` backs up the running database with `pg_dump -Fc`, validates the dump
with `pg_restore --list`, syncs the runtime app role, runs
`prisma migrate deploy` from the backend image, then recreates backend/front.
The existing backend/front services are left running until the DB work succeeds.

If the current production database was created by the old raw-SQL replay path
and has domain tables but no `_prisma_migrations` rows, run the guarded baseline
transition once:

```bash
pnpm deploy:prod:manual -- v0.1.0 --db-mode baseline-existing --allow-baseline-existing --dry-run
pnpm deploy:prod:manual -- v0.1.0 --db-mode baseline-existing --allow-baseline-existing
```

After that, use the normal `migrate` mode. If `_prisma_migrations` already has
rows, `baseline-existing` fails and instructs the operator to use `migrate`.

The destructive reset/seed path is retained only for demo rebuilds:

```bash
pnpm deploy:prod:manual -- v0.1.0 --db-mode reset-demo --allow-destructive-reset --dry-run
pnpm deploy:prod:manual -- v0.1.0 --db-mode reset-demo --allow-destructive-reset
```

This mode takes and validates a backup first, then drops/recreates `public`,
runs `prisma migrate deploy`, and runs the demo seed. Never use it for a real
production data-preserving deploy.

For image-only redeploy or rollback when no DB action should run:

```bash
pnpm deploy:prod:manual -- v0.1.0 --db-mode skip --dry-run
pnpm deploy:prod:manual -- v0.1.0 --db-mode skip
```

The command resolves the ref to an exact commit SHA, builds and pushes:

- `ghcr.io/seniorailab/eldercare-fall-ai/backend:<sha>`
- `ghcr.io/seniorailab/eldercare-fall-ai/front:<sha>`

The frontend image is built with `VITE_USE_MOCK=false` and `VITE_API_BASE_URL=/api`.
The VM still does not build application images; it pulls the explicit SHA tags
and runs `scripts/deploy/ncloud-deploy.sh`.

Equivalent low-level steps, kept for debugging:

From a local checkout:

```bash
SHA="$(git rev-parse --verify v0.1.0^{commit})"
docker build --target runner -f backend/Dockerfile -t "ghcr.io/seniorailab/eldercare-fall-ai/backend:$SHA" .
docker push "ghcr.io/seniorailab/eldercare-fall-ai/backend:$SHA"
docker build --target runner -f front/Dockerfile \
  --build-arg VITE_USE_MOCK=false \
  --build-arg VITE_API_BASE_URL=/api \
  -t "ghcr.io/seniorailab/eldercare-fall-ai/front:$SHA" .
docker push "ghcr.io/seniorailab/eldercare-fall-ai/front:$SHA"
tar -czf /tmp/eldercare-deploy-bundle.tgz \
  compose.yaml compose.prod.yaml backend/prisma
scp -i ~/.ssh/eldercare-fall-ai-ncloud scripts/deploy/ncloud-deploy.sh deploy@101.79.18.95:/tmp/ncloud-deploy.sh
scp -i ~/.ssh/eldercare-fall-ai-ncloud /tmp/eldercare-deploy-bundle.tgz deploy@101.79.18.95:/tmp/eldercare-deploy-bundle.tgz
gh auth token | ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@101.79.18.95 \
  'docker login ghcr.io -u GoBeromsu --password-stdin'
ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@101.79.18.95 \
  "rm -rf /opt/eldercare-fall-ai/current && mkdir -p /opt/eldercare-fall-ai/current && tar -xzf /tmp/eldercare-deploy-bundle.tgz -C /opt/eldercare-fall-ai/current && chmod +x /tmp/ncloud-deploy.sh && IMAGE_TAG=$SHA DEPLOY_DB_MODE=migrate /tmp/ncloud-deploy.sh"
```

The VM deploy script does not build application images. It expects the bundle above and pulls the backend/front images from GHCR.
`IMAGE_TAG` is required; do not run production deploys from an implicit `latest`
fallback. The script writes the resolved backend/front image pins into
`/opt/eldercare-fall-ai/current/.env` so later Compose operations use the same
images without re-exporting deploy variables.

Expected public URL after deploy:

```text
http://101.79.18.95
```

## GitHub Actions

Set these repository secrets:

- `NCLOUD_SSH_PRIVATE_KEY`: contents of `~/.ssh/eldercare-fall-ai-ncloud`
- `NCLOUD_ENV_FILE`: full production `.env` content

Optional repository variables:

- `NCLOUD_HOST`: defaults to `101.79.18.95`
- `NCLOUD_SSH_USER`: defaults to `deploy`

Workflow: `.github/workflows/deploy-ncloud.yml`

The release trigger is currently commented out. The workflow can still be run
through explicit `workflow_dispatch` with a concrete `ref` if an operator
intentionally allows a GitHub-hosted deploy. A merge to `main` runs CI only; it
does not deploy production. When the workflow is re-enabled or manually
dispatched, it builds and pushes two GHCR images before SSH deployment:

- `ghcr.io/seniorailab/eldercare-fall-ai/backend:<sha>`
- `ghcr.io/seniorailab/eldercare-fall-ai/front:<sha>`

Current release and deploy flow:

```bash
pnpm release:prod -- v0.1.0
pnpm deploy:prod:manual -- v0.1.0 --dry-run
pnpm deploy:prod:manual -- v0.1.0
```

To re-enable Actions-backed CD later, uncomment the `release.published` trigger
in `.github/workflows/deploy-ncloud.yml` and update this runbook plus ADR-072.
The current manual command against the same release tag is:

```bash
pnpm deploy:prod:manual -- v0.1.0
```

The default deploy script does not reset `public`, raw-replay migration SQL, or
run the demo seed. It applies pending migrations with `prisma migrate deploy`.
The backend image contains Prisma CLI and `backend/prisma/**` only so deploy
tooling can run one-shot migration commands; the NestJS app process does not run
migrations at startup.

Only `DEPLOY_DB_MODE=reset-demo` runs the compiled backend seed once from the
backend image after an explicit destructive allow flag. The seed creates 녹양역점
demo data and seeds `seniorsailab@gmail.com` as backend `ADMIN`; it does not
create a broad Kakao admin policy.

After the owner Kakao account has logged in once, bind only that exact DB row:

```bash
cd /opt/eldercare-fall-ai/current
COMPOSE_PROFILES=full docker compose -f compose.yaml -f compose.prod.yaml run --rm backend \
  node dist/scripts/bind-demo-users.js --dry-run --email rhqjatn310@kakao
COMPOSE_PROFILES=full docker compose -f compose.yaml -f compose.prod.yaml run --rm backend \
  node dist/scripts/bind-demo-users.js --email rhqjatn310@kakao
```

If Kakao does not expose that label as `User.email`, use the exact `kakaoId`
from the `users` row instead:

```bash
COMPOSE_PROFILES=full docker compose -f compose.yaml -f compose.prod.yaml run --rm backend \
  node dist/scripts/bind-demo-users.js --dry-run --kakao-id <actual-kakao-id>
```

Rollback an accidental bind by exact user id only:

```bash
COMPOSE_PROFILES=full docker compose -f compose.yaml -f compose.prod.yaml exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "UPDATE users SET role='\''ADMIN'\'', facility_id='\''fac_happy_nokyang'\'', session_version=session_version+1 WHERE id='\''<exact-user-id>'\'';"'
```
Deploy checks are fail-fast: the local HTTP smoke check runs once after
`docker compose up --wait`. Retry is a manual operator action after the failure
reason is understood.

## Operations

```bash
ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@101.79.18.95
cd /opt/eldercare-fall-ai/current
COMPOSE_PROFILES=full docker compose -f compose.yaml -f compose.prod.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 front backend
```
