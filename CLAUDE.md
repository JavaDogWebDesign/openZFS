# ZFS Manager — Web GUI for ZFS on Debian

A web application providing a browser-based interface for managing ZFS pools, datasets, snapshots, and replication on Debian Linux.

## Stack

- **Backend:** Python 3.11+ / FastAPI, runs as root via systemd
- **Frontend:** React 18 + TypeScript + Vite, CSS Modules (*.module.css)
- **Realtime:** WebSockets for iostat/events/send-progress
- **Auth:** PAM-based (reuse system users), session cookies
- **DB:** SQLite for sessions, audit log, scheduled replication jobs
- **No TLS in-app** — Cockpit-style: HTTP on localhost, reverse proxy for remote

## Commands

- `cd backend && pip install -r requirements.txt` — install backend deps
- `cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8080` — dev server
- `cd frontend && npm install` — install frontend deps
- `cd frontend && npm run dev` — Vite dev server (port 5173, proxies /api to 8080)
- `cd frontend && npm run build` — production build → frontend/dist/
- `cd backend && pytest` — run backend tests
- `cd frontend && npm run test` — run frontend tests
- `cd frontend && npm run lint` — ESLint + TypeScript check

## Architecture

- `backend/main.py` — FastAPI app entry, mounts routers
- `backend/routes/` — API route modules: pools, datasets, snapshots, replication, system
- `backend/services/zfs.py` — wraps ZFS CLI commands, returns typed dicts
- `backend/services/zpool.py` — wraps zpool CLI commands
- `backend/middleware/auth.py` — PAM authentication, session management
- `backend/models.py` — Pydantic models for request/response validation
- `frontend/src/views/` — 7 main views: Dashboard, Pools, Datasets, Snapshots, Replication, Sharing, Settings
- `frontend/src/components/` — reusable UI components
- `frontend/src/hooks/` — custom hooks for WebSocket streams and API calls
- `frontend/src/lib/api.ts` — typed API client

## Code Style

- Python: type hints everywhere, async endpoints, Pydantic models for all I/O
- TypeScript: strict mode, named exports, no `any`
- React: functional components + hooks only, no class components
- CSS: CSS Modules for scoping (ComponentName.module.css), shared variables in src/styles/variables.css
- All ZFS commands use `-H -p` flags for machine-parseable output
- Destructive operations (destroy, rollback) require a confirmation token from the frontend

## Key Design Decisions

- Backend shells out to `zfs`/`zpool` CLI with `-H -p -o` flags, not libzfs bindings
- All destructive endpoints are POST/DELETE with explicit confirmation body field
- WebSocket endpoints stream `zpool iostat 1` and `zpool events -f` as JSON lines
- Replication scheduler is a background asyncio task, state in SQLite
- The full feature spec is in `docs/DESIGN.md` — read it for API routes and UI wireframes
- The ZFS command inventory is in `docs/ZFS-COMMANDS.md` — reference for which CLI flags to use

## Testing

- Backend: pytest + httpx AsyncClient for endpoint tests, mock subprocess for ZFS commands
- Frontend: Vitest + React Testing Library
- Always mock ZFS commands in tests — never call real zfs/zpool in test suite

## Gotchas

- ZFS dataset paths contain `/` — URL-encode them in API routes (use path parameters with `:path`)
- `zfs list -H` uses TAB separators — split on `\t` not spaces
- `zpool status` has no machine-parseable mode — must be parsed with regex/state machine
- Snapshot names contain `@`, bookmark names contain `#` — handle in URL routing
- `zfs send` can run for hours — always run in background task with progress WebSocket
