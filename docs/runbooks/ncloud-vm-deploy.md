# Naver Cloud VM deploy runbook

This deploys the host stack to the Naver Cloud Ubuntu VM through the registry-image host topology:

- public: `front` nginx on `:80`
- internal only: `backend` on `:8080`, `db` on `:5432`
- images are built in GitHub Actions and pushed to GitHub Container Registry
- the VM only pulls images and runs Docker Compose

## VM

- Public IP: `<retired-host>`
- Login key file: `/Users/<user>/Downloads/seniorsailab.pem`
- OS: `ubuntu-24.04-base`

## One-time access

Naver Cloud's VPC server access flow uses the PEM file to get the initial administrator password in the console. After retrieving that password, SSH as `root`. Reference: [Naver Cloud Access Server guide](https://guide.ncloud-docs.com/docs/en/server-access-vpc).

```bash
chmod 600 /Users/<user>/Downloads/seniorsailab.pem
ssh root@<retired-host>
```

If direct public-key SSH fails, use the console action:

1. Server > Server.
2. Select `eldercare-fall-ai`.
3. Manage servers > Get admin password.
4. Upload `/Users/<user>/Downloads/seniorsailab.pem`.
5. Use the shown password for `root@<retired-host>`.

## Bootstrap

Create a deploy key on the local machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/eldercare-fall-ai-ncloud -C "eldercare-fall-ai ncloud deploy"
```

Run the bootstrap script on the VM as `root` from the local checkout:

```bash
ssh root@<retired-host> \
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

FRONT_ORIGIN=http://<retired-host>
KAKAO_REST_API_KEY=replace-with-kakao-rest-api-key
KAKAO_REDIRECT_URI=http://<retired-host>/auth/kakao/callback
SESSION_JWT_SECRET=replace-with-at-least-32-random-chars
KAKAO_TOKEN_ENC_KEY=replace-with-64-hex-chars
ALERT_DASHBOARD_URL=http://<retired-host>
```

Generate local secret values:

```bash
openssl rand -hex 32  # SESSION_JWT_SECRET or KAKAO_TOKEN_ENC_KEY
openssl rand -base64 32  # POSTGRES_PASSWORD
```

If a database password contains URL-reserved characters such as `@`, `:`, `/`,
`#`, or `%`, percent-encode it in `DATABASE_URL` / `DIRECT_URL`. Keep
`APP_DB_USER=fall_app`; the Prisma migrations grant privileges to that fixed
runtime role.

## Manual deploy

From a local checkout:

```bash
tar -czf /tmp/eldercare-deploy-bundle.tgz \
  compose.yaml compose.prod.yaml compose.registry.yaml backend/prisma/init
scp -i ~/.ssh/eldercare-fall-ai-ncloud scripts/deploy/ncloud-deploy.sh deploy@<retired-host>:/tmp/ncloud-deploy.sh
scp -i ~/.ssh/eldercare-fall-ai-ncloud /tmp/eldercare-deploy-bundle.tgz deploy@<retired-host>:/tmp/eldercare-deploy-bundle.tgz
gh auth token | ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@<retired-host> \
  'docker login ghcr.io -u GoBeromsu --password-stdin'
ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@<retired-host> \
  'rm -rf /opt/eldercare-fall-ai/current && mkdir -p /opt/eldercare-fall-ai/current && tar -xzf /tmp/eldercare-deploy-bundle.tgz -C /opt/eldercare-fall-ai/current && chmod +x /tmp/ncloud-deploy.sh && IMAGE_TAG=<git-sha-or-tag> /tmp/ncloud-deploy.sh'
```

The VM deploy script does not build application images. It expects the bundle above and pulls the backend/front images from GHCR.

Expected public URL after deploy:

```text
http://<retired-host>
```

## GitHub Actions

Set these repository secrets:

- `NCLOUD_SSH_PRIVATE_KEY`: contents of `~/.ssh/eldercare-fall-ai-ncloud`
- `NCLOUD_ENV_FILE`: full production `.env` content

Optional repository variables:

- `NCLOUD_HOST`: defaults to `<retired-host>`
- `NCLOUD_SSH_USER`: defaults to `deploy`

Workflow: `.github/workflows/deploy-ncloud.yml`

It runs after the `CI` workflow succeeds on `main`, and through manual `workflow_dispatch`. The workflow builds and pushes two GHCR images before SSH deployment:

- `ghcr.io/goberomsu/eldercare-fall-ai/backend:<sha>`
- `ghcr.io/goberomsu/eldercare-fall-ai/front:<sha>`

Prisma migrations run as a one-shot container using the backend image.

## Operations

```bash
ssh -i ~/.ssh/eldercare-fall-ai-ncloud deploy@<retired-host>
cd /opt/eldercare-fall-ai/current
COMPOSE_PROFILES=full,migrate docker compose -f compose.yaml -f compose.prod.yaml -f compose.registry.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml -f compose.registry.yaml logs --tail=100 front backend
```
