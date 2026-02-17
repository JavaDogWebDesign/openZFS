#!/usr/bin/env bash
#
# ZFS Manager — Install Script for Debian
#
# Run this on a fresh Debian 12+ system:
#   sudo bash scripts/install.sh
#
# What it does:
#   1. Installs system packages (zfsutils-linux, python3, nodejs, nginx)
#   2. Creates a Python venv and installs backend dependencies
#   3. Builds the React frontend
#   4. Copies everything to /opt/zfs-manager
#   5. Installs and enables the systemd service
#
set -euo pipefail

INSTALL_DIR="/opt/zfs-manager"
SERVICE_NAME="zfs-manager"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Helpers ──────────────────────────────────────────────────────

info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }
err()   { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }
fatal() { err "$@"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────────

[[ $EUID -eq 0 ]] || fatal "This script must be run as root (sudo bash $0)"

if ! grep -qi debian /etc/os-release 2>/dev/null; then
    err "This installer is designed for Debian. Proceeding anyway..."
fi

# ── 1. Install system packages ───────────────────────────────────

info "Updating package lists..."
apt-get update -qq

PACKAGES=(
    zfsutils-linux      # zfs and zpool commands
    python3
    python3-venv
    python3-pip
    python3-pam         # PAM bindings for authentication
    nodejs
    npm
    nginx
)

info "Installing system packages: ${PACKAGES[*]}"
apt-get install -y -qq "${PACKAGES[@]}"

# Verify ZFS is available
if ! command -v zpool &>/dev/null; then
    fatal "zpool command not found after installing zfsutils-linux. Check your kernel modules (modprobe zfs)."
fi
if ! command -v zfs &>/dev/null; then
    fatal "zfs command not found after installing zfsutils-linux."
fi
ok "ZFS tools installed: $(zpool version | head -1)"

# ── 2. Copy project files ────────────────────────────────────────

info "Installing to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

# Copy backend
rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='venv' \
    --exclude='data' \
    --exclude='.pytest_cache' \
    "${REPO_DIR}/backend/" "${INSTALL_DIR}/backend/"

# Copy frontend source (needed for build)
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='dist' \
    "${REPO_DIR}/frontend/" "${INSTALL_DIR}/frontend/"

# ── 3. Python venv + backend deps ────────────────────────────────

info "Setting up Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --quiet --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install --quiet -r "${INSTALL_DIR}/backend/requirements.txt"
ok "Backend dependencies installed"

# ── 4. Build frontend ────────────────────────────────────────────

info "Building frontend..."
cd "${INSTALL_DIR}/frontend"
npm install --silent
npm run build --silent
ok "Frontend built → ${INSTALL_DIR}/frontend/dist/"

# ── 5. Create data directory ─────────────────────────────────────

mkdir -p "${INSTALL_DIR}/backend/data"
ok "Data directory ready: ${INSTALL_DIR}/backend/data"

# ── 6. Install systemd service ───────────────────────────────────

info "Installing systemd service..."
cp "${REPO_DIR}/scripts/zfs-manager.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
ok "Systemd service installed and enabled"

# ── 7. Install nginx config (optional) ───────────────────────────

if [[ -d /etc/nginx/sites-available ]]; then
    info "Installing nginx reverse-proxy config..."
    cp "${REPO_DIR}/scripts/nginx-zfs-manager.conf" /etc/nginx/sites-available/zfs-manager
    # Don't enable by default — user needs to edit server_name and TLS certs first
    info "Nginx config installed to /etc/nginx/sites-available/zfs-manager"
    info "  Edit server_name and TLS settings, then: ln -s /etc/nginx/sites-available/zfs-manager /etc/nginx/sites-enabled/"
fi

# ── 8. Start the service ─────────────────────────────────────────

info "Starting ${SERVICE_NAME}..."
systemctl start "${SERVICE_NAME}"

if systemctl is-active --quiet "${SERVICE_NAME}"; then
    ok "${SERVICE_NAME} is running"
else
    err "${SERVICE_NAME} failed to start. Check: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── Done ──────────────────────────────────────────────────────────

echo ""
ok "ZFS Manager installed successfully!"
echo ""
echo "  Dashboard:  http://127.0.0.1:8080"
echo "  Service:    systemctl status ${SERVICE_NAME}"
echo "  Logs:       journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  Log in with any system user (PAM authentication)."
echo ""
echo "  For remote access, configure the nginx reverse proxy:"
echo "    vim /etc/nginx/sites-available/zfs-manager"
echo ""
