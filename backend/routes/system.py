"""System information API routes."""

import json
import shutil

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from services.cmd import run_cmd
from db import get_audit_log

router = APIRouter()


@router.get("/version")
async def get_version(user: dict = Depends(get_current_user)):
    """Get ZFS and zpool versions."""
    zfs_out, _, _ = await run_cmd(["zfs", "version"])
    zpool_out, _, _ = await run_cmd(["zpool", "version"])
    return {
        "zfs_version": zfs_out.strip(),
        "zpool_version": zpool_out.strip(),
    }


@router.get("/disks")
async def list_disks(user: dict = Depends(get_current_user)):
    """List available block devices."""
    stdout, stderr, rc = await run_cmd([
        "lsblk", "-Jbp", "-o", "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL",
    ])
    if rc != 0:
        return {"error": f"lsblk failed: {stderr}", "devices": []}
    try:
        data = json.loads(stdout)
        return {"devices": data.get("blockdevices", [])}
    except json.JSONDecodeError:
        return {"error": "Failed to parse lsblk output", "devices": []}


@router.get("/arc")
async def get_arc_stats(user: dict = Depends(get_current_user)):
    """Get ARC statistics from /proc/spl/kstat/zfs/arcstats."""
    try:
        with open("/proc/spl/kstat/zfs/arcstats") as f:
            raw = f.read()
    except FileNotFoundError:
        return {"error": "ARC stats not available (not running on Linux with ZFS)"}

    stats = {}
    for line in raw.strip().split("\n"):
        parts = line.split()
        if len(parts) >= 3 and parts[1].isdigit():
            stats[parts[0]] = int(parts[2])

    size = stats.get("size", 0)
    max_size = stats.get("c_max", 0)
    hits = stats.get("hits", 0)
    misses = stats.get("misses", 0)
    total = hits + misses
    hit_rate = (hits / total * 100) if total > 0 else 0
    miss_rate = (misses / total * 100) if total > 0 else 0

    result = {
        "size": size,
        "max_size": max_size,
        "hit_rate": round(hit_rate, 2),
        "miss_rate": round(miss_rate, 2),
        "mru_size": stats.get("mru_size", 0),
        "mfu_size": stats.get("mfu_size", 0),
        "raw": stats,
    }

    # L2ARC stats if available
    l2_hits = stats.get("l2_hits", 0)
    l2_misses = stats.get("l2_misses", 0)
    l2_total = l2_hits + l2_misses
    if l2_total > 0:
        result["l2_size"] = stats.get("l2_size", 0)
        result["l2_hit_rate"] = round(l2_hits / l2_total * 100, 2)

    return result


@router.get("/audit")
async def audit(
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    """Get the audit log."""
    return await get_audit_log(limit=limit, offset=offset)


@router.get("/health")
async def health():
    """Health check (unauthenticated)."""
    zfs_available = shutil.which("zfs") is not None
    zpool_available = shutil.which("zpool") is not None
    return {
        "status": "ok" if (zfs_available and zpool_available) else "degraded",
        "zfs": zfs_available,
        "zpool": zpool_available,
    }
