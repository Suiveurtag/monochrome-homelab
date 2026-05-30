#!/usr/bin/env bash
set -euo pipefail

APP_USER="${MONOCHROME_INSTALL_USER:-monochrome}"
APP_GROUP="${MONOCHROME_INSTALL_GROUP:-monochrome}"
INSTALL_DIR="${MONOCHROME_INSTALL_DIR:-/opt/monochrome}"
CONFIG_DIR="${MONOCHROME_CONFIG_DIR:-/etc/monochrome}"
DATA_DIR="${MONOCHROME_DATA_DIR:-/var/lib/monochrome}"
PUBLIC_URL="${MONOCHROME_PUBLIC_URL:-http://localhost}"
SERVER_HOST="${MONOCHROME_SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${MONOCHROME_SERVER_PORT:-8790}"
UPLOAD_PORT="${MONOCHROME_UPLOAD_PORT:-8789}"
UPLOAD_MAX_BYTES="${MONOCHROME_UPLOAD_MAX_BYTES:-262144000}"
ADMIN_SECRET="${MONOCHROME_ADMIN_SECRET:-}"
BOOTSTRAP_ADMIN_USER_ID="${MONOCHROME_BOOTSTRAP_ADMIN_USER_ID:-}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER_FILE=".monochrome-install"

usage() {
    cat <<EOF
Usage: sudo MONOCHROME_PUBLIC_URL=https://music.example.com $0

Environment overrides:
  MONOCHROME_INSTALL_DIR=/opt/monochrome
  MONOCHROME_CONFIG_DIR=/etc/monochrome
  MONOCHROME_DATA_DIR=/var/lib/monochrome
  MONOCHROME_INSTALL_USER=monochrome
  MONOCHROME_PUBLIC_URL=https://music.example.com
  MONOCHROME_ADMIN_SECRET=<secret>
  MONOCHROME_BOOTSTRAP_ADMIN_USER_ID=<better-auth-user-id>
EOF
}

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        echo "Run this installer with sudo so it can create system users, systemd units, and Nginx config." >&2
        exit 1
    fi
}

require_ubuntu_2604() {
    if [[ ! -r /etc/os-release ]]; then
        echo "Cannot verify the operating system because /etc/os-release is missing." >&2
        exit 1
    fi

    # shellcheck disable=SC1091
    source /etc/os-release
    if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "26.04" ]]; then
        echo "This checkpoint installer targets Ubuntu 26.04. Detected ${PRETTY_NAME:-unknown OS}." >&2
        echo "Set MONOCHROME_ALLOW_UNSUPPORTED_OS=true to run it anyway." >&2
        if [[ "${MONOCHROME_ALLOW_UNSUPPORTED_OS:-false}" != "true" ]]; then
            exit 1
        fi
    fi
}

ensure_safe_install_dir() {
    if [[ -e "${INSTALL_DIR}" && ! -f "${INSTALL_DIR}/${MARKER_FILE}" ]]; then
        echo "${INSTALL_DIR} already exists and was not created by this installer." >&2
        echo "Choose another MONOCHROME_INSTALL_DIR or move the existing directory first." >&2
        exit 1
    fi
}

install_packages() {
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        ca-certificates \
        curl \
        git \
        nginx \
        nodejs \
        npm \
        openssl \
        rsync
}

ensure_user() {
    if ! getent group "${APP_GROUP}" >/dev/null; then
        groupadd --system "${APP_GROUP}"
    fi
    if ! id -u "${APP_USER}" >/dev/null 2>&1; then
        useradd --system --gid "${APP_GROUP}" --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
    fi
}

sync_app() {
    install -d -m 0755 "${INSTALL_DIR}"
    rsync -a --delete \
        --exclude ".git/" \
        --exclude ".env" \
        --exclude ".storage/" \
        --exclude "dist/" \
        --exclude "node_modules/" \
        "${REPO_DIR}/" "${INSTALL_DIR}/"
    touch "${INSTALL_DIR}/${MARKER_FILE}"
}

write_env() {
    if [[ -z "${ADMIN_SECRET}" ]]; then
        ADMIN_SECRET="$(openssl rand -hex 32)"
    fi

    install -d -m 0750 -o root -g "${APP_GROUP}" "${CONFIG_DIR}"
    install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${DATA_DIR}"
    install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${DATA_DIR}/server-uploads"
    install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${DATA_DIR}/self-hosted"

    cat >"${CONFIG_DIR}/monochrome.env" <<EOF
MONOCHROME_SERVER_HOST=${SERVER_HOST}
MONOCHROME_SERVER_PORT=${SERVER_PORT}
MONOCHROME_SERVER_DATA=${DATA_DIR}/self-hosted
MONOCHROME_SELF_HOSTED_SERVER_URL=${PUBLIC_URL}
MONOCHROME_UPLOAD_SERVER_URL=${PUBLIC_URL}
MONOCHROME_AUTH_REQUIRED=true
MONOCHROME_AUTH_APPROVAL_REQUIRED=true
MONOCHROME_AUTH_PROVIDER=placeholder
MONOCHROME_ADMIN_SECRET=${ADMIN_SECRET}
MONOCHROME_BOOTSTRAP_ADMIN_USER_ID=${BOOTSTRAP_ADMIN_USER_ID}
MONOCHROME_UPLOAD_PORT=${UPLOAD_PORT}
MONOCHROME_UPLOAD_STORAGE=${DATA_DIR}/server-uploads
MONOCHROME_UPLOAD_MAX_BYTES=${UPLOAD_MAX_BYTES}
EOF

    chmod 0640 "${CONFIG_DIR}/monochrome.env"
    chown root:"${APP_GROUP}" "${CONFIG_DIR}/monochrome.env"
}

install_dependencies_and_build() {
    cd "${INSTALL_DIR}"
    set -a
    # shellcheck disable=SC1091
    source "${CONFIG_DIR}/monochrome.env"
    set +a
    npm install --no-package-lock
    npm run build
    chown -R root:root "${INSTALL_DIR}"
    chown -R "${APP_USER}:${APP_GROUP}" "${DATA_DIR}"
}

write_systemd_units() {
    cat >/etc/systemd/system/monochrome-selfhost.service <<EOF
[Unit]
Description=Monochrome self-hosted API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/monochrome.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/server/selfhosted/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    cat >/etc/systemd/system/monochrome-uploads.service <<EOF
[Unit]
Description=Monochrome local upload API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/monochrome.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/server/uploads/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now monochrome-selfhost.service monochrome-uploads.service
}

write_nginx_site() {
    cat >/etc/nginx/sites-available/monochrome.conf <<EOF
server {
    listen 80 default_server;
    server_name _;

    root ${INSTALL_DIR}/dist;
    index index.html;
    client_max_body_size ${UPLOAD_MAX_BYTES};

    location /api/ {
        proxy_pass http://${SERVER_HOST}:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location = /health {
        proxy_pass http://${SERVER_HOST}:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:${UPLOAD_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

    if [[ -L /etc/nginx/sites-enabled/default && "$(readlink -f /etc/nginx/sites-enabled/default)" == "/etc/nginx/sites-available/default" ]]; then
        rm /etc/nginx/sites-enabled/default
    fi
    ln -sfn /etc/nginx/sites-available/monochrome.conf /etc/nginx/sites-enabled/monochrome.conf
    nginx -t
    systemctl enable --now nginx
    systemctl reload nginx
}

main() {
    if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
        usage
        exit 0
    fi

    require_root
    require_ubuntu_2604
    ensure_safe_install_dir
    install_packages
    ensure_user
    sync_app
    write_env
    install_dependencies_and_build
    write_systemd_units
    write_nginx_site

    cat <<EOF
Monochrome installed.

App: ${PUBLIC_URL}
Install directory: ${INSTALL_DIR}
Config: ${CONFIG_DIR}/monochrome.env
Data directory: ${DATA_DIR}

Useful commands:
  systemctl status monochrome-selfhost.service
  systemctl status monochrome-uploads.service
  journalctl -u monochrome-selfhost.service -f
  journalctl -u monochrome-uploads.service -f
EOF
}

main "$@"
