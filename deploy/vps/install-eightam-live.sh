#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fvg-scanner}"
SERVICE_USER="${SERVICE_USER:-fvgbot}"
ENV_DIR="${ENV_DIR:-/etc/fvg-scanner}"
LOG_DIR="${LOG_DIR:-/var/log/fvg-scanner}"
SERVICE_NAME="eightam-live.service"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo."
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install Node 22 LTS before running this script."
  exit 1
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

mkdir -p "${APP_DIR}" "${ENV_DIR}" "${LOG_DIR}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .vercel \
    --exclude .env \
    --exclude '.env.*' \
    --exclude logs \
    --exclude outputs \
    "${ROOT_DIR}/" "${APP_DIR}/"
else
  tar -C "${ROOT_DIR}" \
    --exclude node_modules \
    --exclude .next \
    --exclude .vercel \
    --exclude .env \
    --exclude '.env.*' \
    --exclude logs \
    --exclude outputs \
    -cf - . | tar -C "${APP_DIR}" -xf -
fi

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}" "${LOG_DIR}"

if [[ ! -f "${ENV_DIR}/eightam-live.env" ]]; then
  install -m 600 -o root -g root "${ROOT_DIR}/deploy/vps/eightam-live.env.example" "${ENV_DIR}/eightam-live.env"
  echo "Created ${ENV_DIR}/eightam-live.env. Edit it with the live OANDA token, then rerun this installer."
  exit 2
fi

chmod 600 "${ENV_DIR}/eightam-live.env"

cd "${APP_DIR}"
npm ci --omit=dev
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"

install -m 644 "${APP_DIR}/deploy/vps/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "Installed and started ${SERVICE_NAME}."
echo "Status:  systemctl status ${SERVICE_NAME}"
echo "Logs:    journalctl -u ${SERVICE_NAME} -f"
echo "Output:  tail -f ${LOG_DIR}/eightam-live.out.log"
