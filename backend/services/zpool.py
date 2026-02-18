"""Zpool CLI wrapper — all zpool commands go through here.

See docs/ZFS-COMMANDS.md for exact flags and output formats.
NOTE: zpool status has NO machine-parseable mode — must parse with regex/state machine.
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import Any

from exceptions import parse_zfs_error
from services.cmd import run_cmd, validate_pool_name

logger = logging.getLogger(__name__)

# Track active iostat subprocesses by pool name so they can be
# killed directly (SIGKILL) when a pool is about to be destroyed.
_iostat_procs: dict[str, set[asyncio.subprocess.Process]] = {}


async def kill_iostat_procs(pool: str) -> None:
    """SIGKILL all tracked iostat subprocesses for a pool and wait for them to die."""
    procs = _iostat_procs.pop(pool, set())
    for proc in procs:
        try:
            proc.kill()  # SIGKILL — immediate, no graceful shutdown
        except ProcessLookupError:
            pass
    for proc in procs:
        try:
            await proc.wait()
        except Exception:
            pass


async def list_pools() -> list[dict[str, Any]]:
    """List all pools using zpool list -Hp."""
    props = ["name", "size", "alloc", "free", "fragmentation", "capacity", "health"]
    cmd = ["zpool", "list", "-Hp", "-o", ",".join(props)]

    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)

    results = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        fields = line.split("\t")
        results.append(dict(zip(props, fields)))
    return results


async def get_status(pool: str) -> dict[str, Any]:
    """Get detailed pool status. Must parse human-readable output."""
    validate_pool_name(pool)
    cmd = ["zpool", "status", "--", pool]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)

    parsed = parse_status_output(stdout)
    parsed["pool"] = pool
    parsed["raw"] = stdout
    return parsed


async def get_pool_properties(pool: str) -> dict[str, dict[str, str]]:
    """Get all pool properties using zpool get all -Hp."""
    validate_pool_name(pool)
    cmd = ["zpool", "get", "all", "-Hp", "--", pool]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)

    props = {}
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        # Format: name\tproperty\tvalue\tsource
        parts = line.split("\t")
        if len(parts) >= 4:
            props[parts[1]] = {"value": parts[2], "source": parts[3]}
    return props


async def scrub(pool: str, action: str = "start") -> None:
    """Start, pause, or stop a scrub."""
    validate_pool_name(pool)
    cmd = ["zpool", "scrub"]
    if action == "pause":
        cmd.append("-p")
    elif action == "stop":
        cmd.append("-s")
    cmd.extend(["--", pool])

    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def get_iostat(pool: str) -> dict[str, Any]:
    """Get a single I/O stat sample. For streaming, use the WebSocket endpoint."""
    validate_pool_name(pool)
    cmd = ["zpool", "iostat", "-Hp", "--", pool, "1", "2"]  # 2 samples, use the second
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)

    lines = stdout.strip().split("\n")
    if len(lines) >= 2:
        # Second line is the actual measurement (first is since-boot average)
        fields = lines[-1].split("\t")
        return {
            "pool": pool,
            "alloc": fields[1] if len(fields) > 1 else None,
            "free": fields[2] if len(fields) > 2 else None,
            "read_iops": _to_int(fields[3]) if len(fields) > 3 else 0,
            "write_iops": _to_int(fields[4]) if len(fields) > 4 else 0,
            "read_bw": _to_int(fields[5]) if len(fields) > 5 else 0,
            "write_bw": _to_int(fields[6]) if len(fields) > 6 else 0,
        }
    return {"pool": pool}


# --- zpool status parser ---


def parse_status_output(raw: str) -> dict[str, Any]:
    """Parse zpool status output into a structured dict.

    This is the hardest parsing in the app because zpool status has no
    machine-parseable mode. We use a state-machine approach.
    """
    result: dict[str, Any] = {
        "state": "",
        "status": "",
        "action": "",
        "scan": "",
        "config": [],
        "errors": "",
    }

    section = ""
    config_lines: list[str] = []

    for line in raw.split("\n"):
        stripped = line.strip()

        # Detect section headers
        if line.startswith("  pool:"):
            continue  # pool name already known
        elif line.startswith(" state:"):
            result["state"] = line.split(":", 1)[1].strip()
            section = ""
        elif line.startswith("status:"):
            result["status"] = line.split(":", 1)[1].strip()
            section = "status"
        elif line.startswith("action:"):
            result["action"] = line.split(":", 1)[1].strip()
            section = "action"
        elif line.startswith("  scan:"):
            result["scan"] = line.split(":", 1)[1].strip()
            section = "scan"
        elif line.startswith("config:"):
            section = "config"
        elif line.startswith("errors:"):
            result["errors"] = line.split(":", 1)[1].strip()
            section = "errors"
        elif section == "status" and stripped:
            result["status"] += " " + stripped
        elif section == "action" and stripped:
            result["action"] += " " + stripped
        elif section == "scan" and stripped:
            result["scan"] += " " + stripped
        elif section == "config" and stripped:
            config_lines.append(line)
        elif section == "errors" and stripped:
            result["errors"] += " " + stripped

    # Parse config section into device tree
    result["config"] = _parse_config_lines(config_lines)
    return result


def _parse_config_lines(lines: list[str]) -> list[dict[str, Any]]:
    """Parse the config section of zpool status into a device tree.

    Config lines look like:
        NAME        STATE     READ WRITE CKSUM
        tank        ONLINE       0     0     0
          raidz2-0  ONLINE       0     0     0
            sda     ONLINE       0     0     0
            sdb     ONLINE       0     0     0
        logs
          nvme0n1   ONLINE       0     0     0
    """
    devices: list[dict[str, Any]] = []
    if not lines:
        return devices

    # Skip header line (NAME STATE READ WRITE CKSUM)
    data_lines = []
    for line in lines:
        if re.match(r"\s*NAME\s+STATE", line):
            continue
        if line.strip():
            data_lines.append(line)

    # Build tree using indentation levels
    stack: list[tuple[int, dict[str, Any]]] = []

    for line in data_lines:
        # Measure indentation (leading spaces)
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        parts = stripped.split()

        device: dict[str, Any] = {
            "name": parts[0] if parts else "",
            "state": parts[1] if len(parts) > 1 else "",
            "read_errors": parts[2] if len(parts) > 2 else "0",
            "write_errors": parts[3] if len(parts) > 3 else "0",
            "checksum_errors": parts[4] if len(parts) > 4 else "0",
            "children": [],
        }

        # Pop stack entries at same or deeper indentation
        while stack and stack[-1][0] >= indent:
            stack.pop()

        if stack:
            stack[-1][1]["children"].append(device)
        else:
            devices.append(device)

        stack.append((indent, device))

    return devices


# --- Pool creation and destruction ---


async def create_pool(
    name: str,
    vdevs: list[str],
    force: bool = False,
    mountpoint: str | None = None,
    properties: dict[str, str] | None = None,
    fs_properties: dict[str, str] | None = None,
) -> None:
    """Create a new storage pool."""
    validate_pool_name(name)
    cmd = ["zpool", "create"]
    if force:
        cmd.append("-f")
    if mountpoint:
        cmd.extend(["-m", mountpoint])
    for k, v in (properties or {}).items():
        cmd.extend(["-o", f"{k}={v}"])
    for k, v in (fs_properties or {}).items():
        cmd.extend(["-O", f"{k}={v}"])
    cmd.extend(["--", name])
    cmd.extend(vdevs)
    logger.info("Creating pool: %s with vdevs: %s", name, vdevs)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def destroy_pool(pool: str, force: bool = False) -> None:
    """Destroy a pool and all its data. DESTRUCTIVE."""
    validate_pool_name(pool)
    cmd = ["zpool", "destroy"]
    if force:
        cmd.append("-f")
    cmd.extend(["--", pool])
    logger.warning("Destroying pool: %s", pool)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Import / Export ---


async def import_pool(pool: str | None = None, force: bool = False) -> str:
    """Import a pool. If pool is None, returns list of importable pools."""
    cmd = ["zpool", "import"]
    if force:
        cmd.append("-f")
    if pool:
        validate_pool_name(pool)
        cmd.extend(["--", pool])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    return stdout


async def export_pool(pool: str, force: bool = False) -> None:
    """Export (cleanly detach) a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "export"]
    if force:
        cmd.append("-f")
    cmd.extend(["--", pool])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Device management ---


async def add_vdev(pool: str, vdevs: list[str], force: bool = False) -> None:
    """Add vdevs to a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "add"]
    if force:
        cmd.append("-f")
    cmd.extend(["--", pool])
    cmd.extend(vdevs)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def remove_vdev(pool: str, vdev: str) -> None:
    """Remove a vdev from a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "remove", "--", pool, vdev]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def attach(pool: str, existing_dev: str, new_dev: str) -> None:
    """Attach a device to create or extend a mirror."""
    validate_pool_name(pool)
    cmd = ["zpool", "attach", "--", pool, existing_dev, new_dev]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def detach(pool: str, device: str) -> None:
    """Detach a device from a mirror."""
    validate_pool_name(pool)
    cmd = ["zpool", "detach", "--", pool, device]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def replace(pool: str, old_device: str, new_device: str | None = None) -> None:
    """Replace a device in a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "replace", "--", pool, old_device]
    if new_device:
        cmd.append(new_device)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def online(pool: str, device: str) -> None:
    """Bring a device online."""
    validate_pool_name(pool)
    cmd = ["zpool", "online", "--", pool, device]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def offline(pool: str, device: str, temporary: bool = False) -> None:
    """Take a device offline."""
    validate_pool_name(pool)
    cmd = ["zpool", "offline"]
    if temporary:
        cmd.append("-t")
    cmd.extend(["--", pool, device])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Maintenance ---


async def trim(pool: str, stop: bool = False) -> None:
    """Start or stop TRIM on a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "trim"]
    if stop:
        cmd.append("-s")
    cmd.extend(["--", pool])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def clear(pool: str, device: str | None = None) -> None:
    """Clear device errors."""
    validate_pool_name(pool)
    cmd = ["zpool", "clear", "--", pool]
    if device:
        cmd.append(device)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def checkpoint(pool: str, discard: bool = False) -> None:
    """Create or discard a pool checkpoint."""
    validate_pool_name(pool)
    cmd = ["zpool", "checkpoint"]
    if discard:
        cmd.append("-d")
    cmd.extend(["--", pool])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def initialize(pool: str, device: str | None = None) -> None:
    """Initialize (write to unallocated regions) a pool's devices."""
    validate_pool_name(pool)
    cmd = ["zpool", "initialize", "--", pool]
    if device:
        cmd.append(device)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- History ---


async def history(pool: str) -> list[str]:
    """Get command history for a pool."""
    validate_pool_name(pool)
    cmd = ["zpool", "history", "--", pool]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    return [line for line in stdout.strip().split("\n") if line.strip()]


# --- Properties ---


async def set_property(pool: str, prop: str, value: str) -> None:
    """Set a pool property."""
    validate_pool_name(pool)
    cmd = ["zpool", "set", f"{prop}={value}", "--", pool]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


def _to_int(value: str) -> int:
    """Safely convert a zpool iostat string value to int."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0


# --- Streaming (async generators for WebSocket) ---


async def iostat_stream(pool: str, interval: int = 1) -> AsyncGenerator[dict[str, Any], None]:
    """Stream I/O stats as an async generator. For use with WebSocket endpoints.

    NOTE: Does NOT hold the run_cmd semaphore — streaming processes are
    long-lived and would starve short-lived REST commands if they held a slot.
    """
    validate_pool_name(pool)
    try:
        proc = await asyncio.create_subprocess_exec(
            "zpool", "iostat", "-Hp", "--", pool, str(interval),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        logger.error("zpool command not found — is ZFS installed?")
        return

    # Register so kill_iostat_procs() can reach this process
    _iostat_procs.setdefault(pool, set()).add(proc)
    try:
        assert proc.stdout is not None
        skip_first = True
        async for raw_line in proc.stdout:
            line = raw_line.decode().strip()
            if not line:
                continue
            if skip_first:
                skip_first = False
                continue
            fields = line.split("\t")
            yield {
                "pool": pool,
                "alloc": fields[1] if len(fields) > 1 else None,
                "free": fields[2] if len(fields) > 2 else None,
                "read_iops": _to_int(fields[3]) if len(fields) > 3 else 0,
                "write_iops": _to_int(fields[4]) if len(fields) > 4 else 0,
                "read_bw": _to_int(fields[5]) if len(fields) > 5 else 0,
                "write_bw": _to_int(fields[6]) if len(fields) > 6 else 0,
            }
    finally:
        _iostat_procs.get(pool, set()).discard(proc)
        try:
            proc.kill()  # SIGKILL — immediate
        except ProcessLookupError:
            pass  # Already killed by kill_iostat_procs()
        await proc.wait()


async def events_stream() -> AsyncGenerator[str, None]:
    """Stream zpool events as an async generator. For use with WebSocket endpoints.

    NOTE: Does NOT hold the run_cmd semaphore — streaming processes are
    long-lived and would starve short-lived REST commands if they held a slot.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "zpool", "events", "-f", "-H",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        logger.error("zpool command not found — is ZFS installed?")
        return
    try:
        assert proc.stdout is not None
        async for raw_line in proc.stdout:
            line = raw_line.decode().strip()
            if line:
                yield line
    finally:
        proc.terminate()
        await proc.wait()
