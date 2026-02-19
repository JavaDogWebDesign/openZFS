"""NFS exports management for ZFS Manager.

Manages /etc/exports.d/zfs-manager.exports to avoid touching /etc/exports.
"""

import asyncio
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

EXPORTS_DIR = Path("/etc/exports.d")
MANAGED_FILE = EXPORTS_DIR / "zfs-manager.exports"


def _ensure_exports_dir() -> None:
    """Ensure /etc/exports.d/ exists."""
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


async def _reload_exports() -> None:
    """Re-export all NFS shares via exportfs -ra."""
    proc = await asyncio.create_subprocess_exec(
        "exportfs", "-ra",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error("exportfs -ra failed: %s", stderr.decode().strip())
    else:
        logger.info("Reloaded NFS exports")


def list_exports() -> list[dict]:
    """Parse the managed exports file, returns [{path, client, options}]."""
    if not MANAGED_FILE.exists():
        return []

    exports = []
    for line in MANAGED_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Format: /path  client(options)
        match = re.match(r'^(\S+)\s+(\S+)\(([^)]*)\)\s*$', line)
        if match:
            exports.append({
                "path": match.group(1),
                "client": match.group(2),
                "options": match.group(3),
            })
    return exports


async def add_export(path: str, client: str, options: str = "rw,sync,no_subtree_check") -> None:
    """Append an export entry and reload."""
    _ensure_exports_dir()

    # Check for duplicates
    existing = list_exports()
    for entry in existing:
        if entry["path"] == path and entry["client"] == client:
            raise RuntimeError(f"Export already exists: {path} {client}")

    line = f"{path}  {client}({options})\n"
    with MANAGED_FILE.open("a") as f:
        f.write(line)

    await _reload_exports()
    logger.info("Added NFS export: %s %s(%s)", path, client, options)


async def remove_export(path: str, client: str) -> None:
    """Remove an export entry matching path and client, then reload."""
    if not MANAGED_FILE.exists():
        raise RuntimeError("No managed exports file found")

    lines = MANAGED_FILE.read_text().splitlines()
    new_lines = []
    found = False
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        match = re.match(r'^(\S+)\s+(\S+)\(', stripped)
        if match and match.group(1) == path and match.group(2) == client:
            found = True
            continue
        new_lines.append(line)

    if not found:
        raise RuntimeError(f"Export not found: {path} {client}")

    MANAGED_FILE.write_text("\n".join(new_lines) + "\n" if new_lines else "")
    await _reload_exports()
    logger.info("Removed NFS export: %s %s", path, client)
