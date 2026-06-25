#!/usr/bin/env sh
set -eu

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_ROOT="${APP_ROOT:-/opt/eldercare-fall-ai}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo env \
      DEPLOY_USER="$DEPLOY_USER" \
      APP_ROOT="$APP_ROOT" \
      SWAP_SIZE="$SWAP_SIZE" \
      DEPLOY_PUBLIC_KEY="${DEPLOY_PUBLIC_KEY:-}" \
      DEPLOY_PUBLIC_KEY_FILE="${DEPLOY_PUBLIC_KEY_FILE:-}" \
      "$0" "$@"
  fi
  echo "ncloud-bootstrap.sh must run as root, or as a sudo-capable user." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl openssh-server docker.io
apt-get install -y docker-compose-v2 || apt-get install -y docker-compose-plugin

systemctl enable --now ssh
systemctl enable --now docker

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_ROOT" "$APP_ROOT/shared"

if [ "$SWAP_SIZE" != "0" ] && ! swapon --show=NAME | grep -qx /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

if [ -n "${DEPLOY_PUBLIC_KEY:-}" ] || [ -n "${DEPLOY_PUBLIC_KEY_FILE:-}" ]; then
  user_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$user_home/.ssh"
  if [ -n "${DEPLOY_PUBLIC_KEY:-}" ]; then
    printf '%s\n' "$DEPLOY_PUBLIC_KEY" > "$user_home/.ssh/authorized_keys"
  else
    cp "$DEPLOY_PUBLIC_KEY_FILE" "$user_home/.ssh/authorized_keys"
  fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$user_home/.ssh/authorized_keys"
  chmod 0600 "$user_home/.ssh/authorized_keys"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
fi

docker --version
docker compose version
printf 'Bootstrap complete. deploy_user=%s app_root=%s\n' "$DEPLOY_USER" "$APP_ROOT"
