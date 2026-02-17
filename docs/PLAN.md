# Implementation Plan

Ordered task list. Check off as completed. Claude Code: read this file to understand current progress and what to work on next.

## Phase 1: Backend Foundation

- [ ] `backend/services/zfs.py` — complete all dataset operations (create, destroy, rename, set, inherit, mount, unmount, share, clone, promote, rollback)
- [ ] `backend/services/zpool.py` — complete all pool operations (create, destroy, import, export, add, attach, detach, replace, online, offline, trim, checkpoint, clear, history)
- [ ] `backend/services/zpool.py` — implement `zpool status` parser (see `.claude/skills/zpool-status-parser/SKILL.md`)
- [ ] `backend/models.py` — Pydantic models for all request/response types
- [ ] `backend/middleware/auth.py` — PAM authentication + session cookie management
- [ ] `backend/routes/pools.py` — pool CRUD + actions (scrub, trim, etc.)
- [ ] `backend/routes/datasets.py` — dataset CRUD + property management
- [ ] `backend/routes/snapshots.py` — snapshot CRUD + rollback, clone, diff, hold
- [ ] `backend/routes/replication.py` — send/receive endpoints + job scheduler
- [ ] `backend/routes/system.py` — health, ARC stats, version, disk listing
- [ ] `backend/ws.py` — WebSocket endpoints for iostat stream, events stream, send progress
- [ ] `backend/db.py` — SQLite setup for sessions, audit log, replication jobs

## Phase 2: Frontend Foundation

- [ ] `frontend/src/lib/api.ts` — typed API client with error handling
- [ ] `frontend/src/hooks/useWebSocket.ts` — hook for WebSocket streams
- [ ] `frontend/src/hooks/useApi.ts` — hook for REST API calls with loading/error state
- [ ] `frontend/src/App.tsx` — router setup with sidebar navigation
- [ ] `frontend/src/components/Layout.tsx` — app shell with sidebar + content area
- [ ] `frontend/src/components/ConfirmDialog.tsx` — destructive action confirmation (type name to confirm)

## Phase 3: Core Views

- [ ] `frontend/src/views/Dashboard.tsx` — pool summary cards, health, I/O chart, events feed
- [ ] `frontend/src/views/Pools.tsx` — pool list, device tree, actions
- [ ] `frontend/src/views/Datasets.tsx` — hierarchical tree browser, property panel, space usage
- [ ] `frontend/src/views/Snapshots.tsx` — snapshot list, diff viewer, actions
- [ ] `frontend/src/views/Replication.tsx` — job list, manual send/receive form, bookmarks
- [ ] `frontend/src/views/Sharing.tsx` — NFS/SMB share list, encryption key management
- [ ] `frontend/src/views/Settings.tsx` — delegation (zfs allow), ARC stats, audit log

## Phase 4: Advanced Features

- [ ] Pool creation wizard (multi-step: select disks → topology → properties → confirm)
- [ ] Replication job scheduler (cron-like scheduling with SQLite persistence)
- [ ] Live I/O charts using Recharts + WebSocket feed
- [ ] `zpool status` device tree visual component (collapsible tree with health indicators)
- [ ] Snapshot diff viewer (file list with M/+/-/R indicators)
- [ ] ARC statistics dashboard with hit rate graphs

## Phase 5: Testing & Polish

- [ ] Backend pytest suite — mock subprocess, test each route
- [ ] Frontend Vitest suite — test key components and hooks
- [ ] Error handling — graceful fallbacks for permission errors, missing pools, etc.
- [ ] Loading states and skeleton screens
- [ ] Mobile responsive layout
- [ ] Production build pipeline verification
