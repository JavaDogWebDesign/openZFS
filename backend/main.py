"""ZFS Manager — FastAPI backend entry point."""

import logging
import shutil
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from exceptions import ZFSError
from models import LoginRequest
from services.cmd import ValidationError
from middleware.auth import login, logout, get_current_user
from routes import pools, datasets, snapshots, replication, system
from ws import router as ws_router
from db import close_db

logger = logging.getLogger(__name__)

app = FastAPI(
    title="ZFS Manager",
    version="0.1.0",
    description="Web GUI for ZFS administration on Debian",
)

# CORS for dev (Vite on :5173 → backend on :8080)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_db()


# --- Auth routes ---


@app.post("/api/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    return await login(body.username, body.password, response)


@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    return await logout(response)


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


# --- Mount routers ---

app.include_router(pools.router, prefix="/api/pools", tags=["pools"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(snapshots.router, prefix="/api/snapshots", tags=["snapshots"])
app.include_router(replication.router, prefix="/api/replication", tags=["replication"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
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
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
