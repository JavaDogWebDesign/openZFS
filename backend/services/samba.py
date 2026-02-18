"""Samba configuration management for ZFS-managed SMB shares.

Manages a dedicated include file (/etc/samba/zfs-manager-shares.conf) so that
ZFS Manager shares don't interfere with manually configured Samba shares.
"""

import asyncio
import configparser
import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SAMBA_CONF = Path("/etc/samba/smb.conf")
INCLUDE_CONF = Path("/etc/samba/zfs-manager-shares.conf")
INCLUDE_LINE = f"include = {INCLUDE_CONF}"


def _share_name(dataset: str) -> str:
    """Derive a Samba share name from a ZFS dataset path.

    e.g. 'tank3/data' -> 'tank3_data'
    """
    return dataset.replace("/", "_")


async def ensure_include() -> None:
    """Add the include directive to smb.conf if not already present (idempotent)."""
    if not SAMBA_CONF.exists():
        logger.warning("smb.conf not found at %s — skipping include setup", SAMBA_CONF)
        return

    content = SAMBA_CONF.read_text()
    if INCLUDE_LINE in content:
        return

    # Append include directive at the end of smb.conf
    with SAMBA_CONF.open("a") as f:
        f.write(f"\n{INCLUDE_LINE}\n")
    logger.info("Added include directive to %s", SAMBA_CONF)


def _read_config() -> configparser.ConfigParser:
    """Read the ZFS Manager shares config file."""
    cp = configparser.ConfigParser()
    if INCLUDE_CONF.exists():
        cp.read(str(INCLUDE_CONF))
    return cp


def _write_config(cp: configparser.ConfigParser) -> None:
    """Write the ZFS Manager shares config file."""
    with INCLUDE_CONF.open("w") as f:
        cp.write(f)


async def _reload_smbd() -> None:
    """Reload Samba to pick up config changes."""
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "reload", "smbd",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error("Failed to reload smbd: %s", stderr.decode().strip())
    else:
        logger.info("Reloaded smbd")


async def set_share(
    dataset: str,
    mountpoint: str,
    guest_ok: bool = False,
    browseable: bool = True,
    read_only: bool = False,
) -> str:
    """Write or update a share section in the include file.

    Returns the share name.
    """
    await ensure_include()

    share_name = _share_name(dataset)
    cp = _read_config()

    if not cp.has_section(share_name):
        cp.add_section(share_name)

    cp.set(share_name, "path", mountpoint)
    cp.set(share_name, "guest ok", "yes" if guest_ok else "no")
    cp.set(share_name, "browseable", "yes" if browseable else "no")
    cp.set(share_name, "read only", "yes" if read_only else "no")
    cp.set(share_name, "# managed by", "zfs-manager")

    _write_config(cp)
    await _reload_smbd()

    logger.info("Set SMB share [%s] -> %s", share_name, mountpoint)
    return share_name


async def remove_share(dataset: str) -> bool:
    """Remove a share section from the include file.

    Returns True if the section was found and removed.
    """
    share_name = _share_name(dataset)
    cp = _read_config()

    if not cp.has_section(share_name):
        return False

    cp.remove_section(share_name)
    _write_config(cp)
    await _reload_smbd()

    logger.info("Removed SMB share [%s]", share_name)
    return True


def get_share(dataset: str) -> dict | None:
    """Get the current SMB config for a dataset, or None if not found."""
    share_name = _share_name(dataset)
    cp = _read_config()

    if not cp.has_section(share_name):
        return None

    return {
        "share_name": share_name,
        "path": cp.get(share_name, "path", fallback=""),
        "guest_ok": cp.get(share_name, "guest ok", fallback="no") == "yes",
        "browseable": cp.get(share_name, "browseable", fallback="yes") == "yes",
        "read_only": cp.get(share_name, "read only", fallback="no") == "yes",
    }


def list_shares() -> list[dict]:
    """List all ZFS Manager-managed SMB shares."""
    cp = _read_config()
    shares = []
    for section in cp.sections():
        shares.append({
            "share_name": section,
            "path": cp.get(section, "path", fallback=""),
            "guest_ok": cp.get(section, "guest ok", fallback="no") == "yes",
            "browseable": cp.get(section, "browseable", fallback="yes") == "yes",
            "read_only": cp.get(section, "read only", fallback="no") == "yes",
        })
    return shares
