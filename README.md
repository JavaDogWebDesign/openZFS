# ZFS Manager

A web-based GUI for managing ZFS storage pools, datasets, snapshots, and replication on Debian Linux.

## Features

- **Dashboard** — pool health, I/O stats, events feed at a glance
- **Pool Management** — create, destroy, import/export, scrub, device tree visualization
- **Dataset Browser** — hierarchical filesystem/volume browser with property editor
- **Snapshot Manager** — create, rollback, diff, clone, hold/release, bookmark
- **Replication** — send/receive with progress tracking, scheduled jobs
- **Sharing** — NFS and SMB share management
- **Encryption** — key loading/unloading, key rotation
- **Monitoring** — live I/O stats via WebSocket, ARC/L2ARC statistics

## Architecture

- **Backend:** Python / FastAPI running as root (required for ZFS commands)
- **Frontend:** React + TypeScript + Vite + CSS Modules
- **Realtime:** WebSocket streams for `zpool iostat` and `zpool events`
- **Auth:** PAM-based authentication (system users)
- **Network:** HTTP on localhost (Cockpit-style) — use a reverse proxy for TLS

## Quick Start (Development)

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
sudo uvicorn main:app --reload --host 127.0.0.1 --port 8080

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → open http://localhost:5173
```

## Production Deployment

```bash
# Install
sudo cp -r . /opt/zfs-manager
cd /opt/zfs-manager/backend
sudo python3 -m venv /opt/zfs-manager/venv
sudo /opt/zfs-manager/venv/bin/pip install -r requirements.txt

# Build frontend
cd /opt/zfs-manager/frontend
npm ci && npm run build

# Install systemd service
sudo cp scripts/zfs-manager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zfs-manager

# Optional: nginx reverse proxy for remote access
sudo cp scripts/nginx-zfs-manager.conf /etc/nginx/sites-available/zfs-manager
sudo ln -s /etc/nginx/sites-available/zfs-manager /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Documentation

- `docs/DESIGN.md` — Full feature map, UI wireframes, API endpoint design
- `docs/ZFS-COMMANDS.md` — CLI command reference with exact flags for backend implementation

## License

TBD
