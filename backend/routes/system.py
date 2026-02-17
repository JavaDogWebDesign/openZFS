"""System information API routes."""

import json
import re
import shutil

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from services.cmd import run_cmd
from services.smart import get_all_smart
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


@router.get("/drives")
async def list_drives(user: dict = Depends(get_current_user)):
    """List physical drives with SMART health and pool membership."""
    # 1. Get extended lsblk info
    stdout, stderr, rc = await run_cmd([
        "lsblk", "-Jbp", "-o",
        "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL,ROTA,TRAN,VENDOR,REV",
    ])
    if rc != 0:
        return {"error": f"lsblk failed: {stderr}", "drives": []}

    try:
        lsblk_data = json.loads(stdout)
    except json.JSONDecodeError:
        return {"error": "Failed to parse lsblk output", "drives": []}

    all_devices = lsblk_data.get("blockdevices", [])

    # Filter to physical disks only
    disks = [d for d in all_devices if d.get("type") == "disk"]

    # 2. Build pool-device map via zpool status -LP
    pool_map: dict[str, str] = {}  # device path -> pool name
    zpool_out, _, zpool_rc = await run_cmd(["zpool", "status", "-LP"])
    if zpool_rc == 0:
        current_pool = None
        for line in zpool_out.splitlines():
            pool_match = re.match(r"^\s*pool:\s+(\S+)", line)
            if pool_match:
                current_pool = pool_match.group(1)
                continue
            if current_pool:
                # Lines with device paths like /dev/sda1 or /dev/disk/by-id/...
                dev_match = re.match(r"^\s+(/dev/\S+)", line)
                if dev_match:
                    dev_path = dev_match.group(1)
                    pool_map[dev_path] = current_pool

    # 3. Get SMART data for all disks
    device_names = [d["name"] for d in disks]
    smart_data = await get_all_smart(device_names)

    # 4. Merge everything
    drives = []
    for disk in disks:
        name = disk["name"]
        size = disk.get("size")
        rota = disk.get("rota")
        tran = (disk.get("tran") or "").upper()

        # Determine drive type
        if rota is True or rota == "1" or rota == 1:
            drive_type = "HDD"
        elif tran == "NVME":
            drive_type = "NVMe"
        else:
            drive_type = "SSD"

        # Check pool membership for this disk and its partitions
        pool = None
        children = disk.get("children", [])
        # Check the disk itself
        if name in pool_map:
            pool = pool_map[name]
        # Check partitions
        for child in children:
            child_name = child.get("name", "")
            if child_name in pool_map and pool is None:
                pool = pool_map[child_name]

        smart = smart_data.get(name, {"available": False})

        drives.append({
            "name": name,
            "size": size,
            "model": (disk.get("model") or "").strip() or None,
            "serial": (disk.get("serial") or "").strip() or None,
            "vendor": (disk.get("vendor") or "").strip() or None,
            "rev": (disk.get("rev") or "").strip() or None,
            "type": drive_type,
            "transport": tran or None,
            "rota": rota,
            "pool": pool,
            "children": [
                {
                    "name": c.get("name"),
                    "size": c.get("size"),
                    "fstype": c.get("fstype"),
                    "mountpoint": c.get("mountpoint"),
                }
                for c in children
            ],
            "smart": smart,
        })

    return {"drives": drives}


@router.get("/info")
async def get_system_info(user: dict = Depends(get_current_user)):
    """Get comprehensive system information."""
    import platform
    import os

    info: dict = {}

    # Hostname and kernel
    info["hostname"] = platform.node()
    info["kernel"] = platform.release()
    info["arch"] = platform.machine()

    # OS pretty name from /etc/os-release
    info["os"] = "Linux"
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    info["os"] = line.split("=", 1)[1].strip().strip('"')
                    break
    except FileNotFoundError:
        pass

    # Uptime from /proc/uptime
    info["uptime_seconds"] = 0
    try:
        with open("/proc/uptime") as f:
            info["uptime_seconds"] = int(float(f.read().split()[0]))
    except (FileNotFoundError, ValueError, IndexError):
        pass

    # CPU info from /proc/cpuinfo
    info["cpu_model"] = "Unknown"
    info["cpu_cores"] = os.cpu_count() or 0
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.startswith("model name"):
                    info["cpu_model"] = line.split(":", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass

    # Memory from /proc/meminfo
    info["memory_total"] = 0
    info["memory_available"] = 0
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    info["memory_total"] = int(line.split()[1]) * 1024  # kB to bytes
                elif line.startswith("MemAvailable:"):
                    info["memory_available"] = int(line.split()[1]) * 1024
    except (FileNotFoundError, ValueError, IndexError):
        pass

    # ZFS versions
    zfs_out, _, _ = await run_cmd(["zfs", "version"])
    zpool_out, _, _ = await run_cmd(["zpool", "version"])
    info["zfs_version"] = zfs_out.strip()
    info["zpool_version"] = zpool_out.strip()

    return info


@router.get("/arc")
async def get_arc_stats(user: dict = Depends(get_current_user)):
    """Get ARC statistics from /proc/spl/kstat/zfs/arcstats."""
    try:
        with open("/proc/spl/kstat/zfs/arcstats") as f:
            raw = f.read()
    except FileNotFoundError:
        return {"error": "ARC stats not available (not running on Linux with ZFS)"}

    stats = {}
    lines = raw.strip().split("\n")
    for line in lines[2:]:
        parts = line.split()
        if len(parts) >= 3:
            try:
                stats[parts[0]] = int(parts[2])
            except ValueError:
                continue

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
