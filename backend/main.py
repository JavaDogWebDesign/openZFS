"""ZFS Manager — FastAPI backend entry point."""

import asyncio
import logging
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from exceptions import ZFSError
from models import LoginRequest
from services.cmd import ValidationError
from middleware.auth import check_rate_limit, login, logout, get_current_user
from routes import pools, datasets, snapshots, replication, system, users
from ws import router as ws_router
from db import cleanup_sessions, close_db, list_scrub_schedules, update_scrub_schedule
from services import zpool

logger = logging.getLogger(__name__)

app = FastAPI(
    title="ZFS Manager",
    version="0.1.0",
    description="Web GUI for ZFS administration on Debian",
)

# CORS for dev (Vite on :5173 → backend on :8080)
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Exception handlers ---


@app.exception_handler(ZFSError)
async def zfs_error_handler(request: Request, exc: ZFSError) -> JSONResponse:
    """Map ZFS exceptions to HTTP responses with safe error messages."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message},
    )


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Map input validation errors to 400 responses."""
    return JSONResponse(
        status_code=400,
        content={"error": str(exc)},
    )


# --- Lifecycle ---


async def scrub_scheduler() -> None:
    """Background task that checks enabled scrub schedules every 60s."""
    while True:
        try:
            await asyncio.sleep(60)
            schedules = await list_scrub_schedules()
            now = datetime.now()

            for sched in schedules:
                if not sched.get("enabled"):
                    continue

                should_run = False
                freq = sched["frequency"]

                if freq == "daily":
                    should_run = now.hour == sched["hour"] and now.minute == sched["minute"]
                elif freq == "weekly":
                    should_run = (
                        now.weekday() == sched["day_of_week"]
                        and now.hour == sched["hour"]
                        and now.minute == sched["minute"]
                    )
                elif freq == "monthly":
                    should_run = (
                        now.day == sched["day_of_month"]
                        and now.hour == sched["hour"]
                        and now.minute == sched["minute"]
                    )

                if not should_run:
                    continue

                # Dedup: skip if already ran this minute
                last_run = sched.get("last_run")
                if last_run and (time.time() - last_run) < 120:
                    continue

                pool_name = sched["pool"]
                logger.info("Scrub scheduler: starting scrub on %s", pool_name)
                try:
                    await zpool.scrub(pool_name, action="start")
                    await update_scrub_schedule(
                        sched["id"], last_run=time.time(), last_status="started"
                    )
                except Exception as e:
                    logger.error("Scrub scheduler: failed to scrub %s: %s", pool_name, e)
                    await update_scrub_schedule(
                        sched["id"], last_run=time.time(), last_status=f"error: {e}"
                    )
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Scrub scheduler: unexpected error")


async def session_cleanup_task():
    while True:
        await asyncio.sleep(3600)
        try:
            await cleanup_sessions()
        except Exception:
            pass


@app.on_event("startup")
async def startup() -> None:
    """Verify ZFS tools are available at startup."""
    zfs_path = shutil.which("zfs")
    zpool_path = shutil.which("zpool")

    if not zfs_path or not zpool_path:
        missing = []
        if not zfs_path:
            missing.append("zfs")
        if not zpool_path:
            missing.append("zpool")
        logger.critical(
            "Required commands not found: %s. "
            "Install ZFS: apt install zfsutils-linux",
            ", ".join(missing),
        )
        sys.exit(1)

    logger.info("ZFS tools found: zfs=%s, zpool=%s", zfs_path, zpool_path)

    # Start background scrub scheduler
    app.state.scrub_task = asyncio.create_task(scrub_scheduler())

    # Start background session cleanup task
    app.state.cleanup_task = asyncio.create_task(session_cleanup_task())


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_db()


# --- Auth routes ---


@app.post("/api/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    if not check_rate_limit(body.username):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    return await login(body.username, body.password, response)


@app.post("/api/auth/logout")
async def auth_logout(response: Response, zfs_session: str | None = Cookie(None)):
    return await logout(response, zfs_session)


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


# --- Mount routers ---

app.include_router(pools.router, prefix="/api/pools", tags=["pools"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(snapshots.router, prefix="/api/snapshots", tags=["snapshots"])
app.include_router(replication.router, prefix="/api/replication", tags=["replication"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(ws_router, prefix="/api/ws", tags=["websocket"])


# --- Health check (unauthenticated) ---


@app.get("/api/health")
async def health() -> dict:
    """Health check — verifies ZFS tools are available."""
    zfs_available = shutil.which("zfs") is not None
    zpool_available = shutil.which("zpool") is not None
    healthy = zfs_available and zpool_available

    return {
        "status": "ok" if healthy else "degraded",
        "zfs": zfs_available,
        "zpool": zpool_available,
    }


# --- Serve frontend static files (production) ---
# Must be mounted AFTER all API routes so /api/* takes priority.

_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_index_html = _frontend_dist / "index.html"

if _frontend_dist.is_dir() and _index_html.is_file():
    # Serve JS/CSS/image bundles from the assets directory
    _assets_dir = _frontend_dist / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    # SPA fallback: serve index.html for all non-API routes
    # This ensures client-side routing works on page refresh/direct navigation
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> Response:
        # Serve actual files from dist (e.g., favicon.ico, robots.txt)
        file_path = (_frontend_dist / full_path).resolve()
        if (
            full_path
            and not full_path.startswith("api/")
            and file_path.is_relative_to(_frontend_dist)
            and file_path.is_file()
        ):
            return FileResponse(str(file_path))
        # index.html must never be cached — the hashed JS/CSS filenames
        # inside it change on every build; a stale index.html loads stale bundles.
        return FileResponse(
            str(_index_html),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
