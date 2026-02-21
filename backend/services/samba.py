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


def _read_config() -> configparser.RawConfigParser:
    """Read the ZFS Manager shares config file.

    Uses ``RawConfigParser`` with ``delimiters=("=",)`` so that Samba
    directives containing colons (e.g. ``fruit:metadata = stream``) are
    not mis-parsed as duplicate keys.
    """
    cp = configparser.RawConfigParser(delimiters=("=",), strict=False)
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
    valid_users: str = "",
    write_list: str = "",
    create_mask: str = "",
    directory_mask: str = "",
    force_user: str = "",
    force_group: str = "",
    inherit_permissions: bool = False,
    vfs_objects: str = "",
    extra_params: dict[str, str] | None = None,
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

    # Optional directives — only write if non-empty, remove if cleared
    _optional_directives = {
        "valid users": valid_users,
        "write list": write_list,
        "create mask": create_mask,
        "directory mask": directory_mask,
        "force user": force_user,
        "force group": force_group,
        "vfs objects": vfs_objects,
    }
    for directive, value in _optional_directives.items():
        if value:
            cp.set(share_name, directive, value)
        elif cp.has_option(share_name, directive):
            cp.remove_option(share_name, directive)

    # Boolean optional directive
    if inherit_permissions:
        cp.set(share_name, "inherit permissions", "yes")
    elif cp.has_option(share_name, "inherit permissions"):
        cp.remove_option(share_name, "inherit permissions")

    # Extra params from presets (shadow_copy2, macOS, audit, etc.)
    if extra_params:
        for key, value in extra_params.items():
            cp.set(share_name, key, value)

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


def _read_share_section(cp: configparser.ConfigParser, section: str) -> dict:
    """Read a single share section into a dict."""
    return {
        "share_name": section,
        "path": cp.get(section, "path", fallback=""),
        "guest_ok": cp.get(section, "guest ok", fallback="no") == "yes",
        "browseable": cp.get(section, "browseable", fallback="yes") == "yes",
        "read_only": cp.get(section, "read only", fallback="no") == "yes",
        "valid_users": cp.get(section, "valid users", fallback=""),
        "write_list": cp.get(section, "write list", fallback=""),
        "create_mask": cp.get(section, "create mask", fallback=""),
        "directory_mask": cp.get(section, "directory mask", fallback=""),
        "force_user": cp.get(section, "force user", fallback=""),
        "force_group": cp.get(section, "force group", fallback=""),
        "inherit_permissions": cp.get(section, "inherit permissions", fallback="no") == "yes",
        "vfs_objects": cp.get(section, "vfs objects", fallback=""),
    }


def get_share(dataset: str) -> dict | None:
    """Get the current SMB config for a dataset, or None if not found."""
    share_name = _share_name(dataset)
    cp = _read_config()

    if not cp.has_section(share_name):
        return None

    return _read_share_section(cp, share_name)


def list_shares() -> list[dict]:
    """List all ZFS Manager-managed SMB shares."""
    cp = _read_config()
    return [_read_share_section(cp, section) for section in cp.sections()]


async def remove_shares_for_pool(pool: str) -> list[str]:
    """Remove all managed SMB shares whose path is under *pool*'s mount tree.

    Also force-disconnects active Samba clients from those shares so that
    ``smbd`` releases its file handles before we destroy the pool.

    Returns the list of removed share names.
    """
    cp = _read_config()
    prefix = f"/{pool}" if pool.startswith("/") else f"/{pool}/"
    pool_root = f"/{pool}"

    removed: list[str] = []
    for section in list(cp.sections()):
        path = cp.get(section, "path", fallback="")
        # Match paths like /tank3, /tank3/child, but not /tank33
        if path == pool_root or path.startswith(prefix):
            # Force-disconnect clients before removing the config
            try:
                proc = await asyncio.create_subprocess_exec(
                    "smbcontrol", "smbd", "close-share", section,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.communicate()
            except FileNotFoundError:
                pass  # smbcontrol not installed
            cp.remove_section(section)
            removed.append(section)

    if removed:
        _write_config(cp)
        await _reload_smbd()
        logger.info("Removed %d SMB share(s) for pool %s: %s", len(removed), pool, removed)

    return removed


# --- Samba user management ---


async def list_users() -> list[dict]:
    """List Samba users via pdbedit."""
    proc = await asyncio.create_subprocess_exec(
        "pdbedit", "-L",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        logger.error("pdbedit -L failed: %s", err)
        raise RuntimeError(f"Failed to list Samba users: {err}")

    users = []
    for line in stdout.decode().strip().splitlines():
        # Format: username:uid:full name
        parts = line.split(":")
        if len(parts) >= 3:
            users.append({
                "username": parts[0],
                "full_name": parts[2],
            })
        elif len(parts) >= 1 and parts[0]:
            users.append({
                "username": parts[0],
                "full_name": "",
            })
    return users


async def add_user(username: str, password: str) -> None:
    """Add a Samba user. The user must already exist as a system user."""
    proc = await asyncio.create_subprocess_exec(
        "smbpasswd", "-a", "-s", username,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=f"{password}\n{password}\n".encode())
    if proc.returncode != 0:
        err = stderr.decode().strip()
        logger.error("smbpasswd -a failed for %s: %s", username, err)
        raise RuntimeError(f"Failed to add Samba user '{username}': {err}")
    logger.info("Added Samba user: %s", username)


async def remove_user(username: str) -> None:
    """Remove a Samba user."""
    proc = await asyncio.create_subprocess_exec(
        "smbpasswd", "-x", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        logger.error("smbpasswd -x failed for %s: %s", username, err)
        raise RuntimeError(f"Failed to remove Samba user '{username}': {err}")
    logger.info("Removed Samba user: %s", username)


async def update_share_valid_users(share_name: str, valid_users: str) -> None:
    """Update the 'valid users' directive for a share section."""
    cp = _read_config()

    if not cp.has_section(share_name):
        raise RuntimeError(f"Share '{share_name}' not found in managed config")

    if valid_users.strip():
        cp.set(share_name, "valid users", valid_users.strip())
    elif cp.has_option(share_name, "valid users"):
        cp.remove_option(share_name, "valid users")

    _write_config(cp)
    await _reload_smbd()
    logger.info("Updated valid users for [%s]: %s", share_name, valid_users or "(removed)")


async def change_password(username: str, password: str) -> None:
    """Change a Samba user's password."""
    proc = await asyncio.create_subprocess_exec(
        "smbpasswd", "-s", username,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=f"{password}\n{password}\n".encode())
    if proc.returncode != 0:
        err = stderr.decode().strip()
        logger.error("smbpasswd password change failed for %s: %s", username, err)
        raise RuntimeError(f"Failed to change password for '{username}': {err}")
    logger.info("Changed Samba password for: %s", username)


# --- Samba global settings ---


_GLOBAL_KEYS = {"server string", "workgroup", "log level", "map to guest", "usershare allow guests"}


def get_global_settings() -> dict:
    """Read key settings from smb.conf [global] section."""
    cp = configparser.ConfigParser()
    if SAMBA_CONF.exists():
        cp.read(str(SAMBA_CONF))

    result = {}
    if cp.has_section("global"):
        result["server_string"] = cp.get("global", "server string", fallback="")
        result["workgroup"] = cp.get("global", "workgroup", fallback="")
        log_level = cp.get("global", "log level", fallback="")
        result["log_level"] = int(log_level) if log_level.isdigit() else None
        result["map_to_guest"] = cp.get("global", "map to guest", fallback="")
        usershare = cp.get("global", "usershare allow guests", fallback="")
        result["usershare_allow_guests"] = usershare.lower() == "yes" if usershare else None
    return result


async def set_global_settings(
    server_string: str = "",
    workgroup: str = "",
    log_level: int | None = None,
    map_to_guest: str = "",
    usershare_allow_guests: bool | None = None,
) -> None:
    """Update smb.conf [global] section values, then reload smbd."""
    if not SAMBA_CONF.exists():
        raise RuntimeError("smb.conf not found")

    cp = configparser.ConfigParser()
    cp.read(str(SAMBA_CONF))

    if not cp.has_section("global"):
        cp.add_section("global")

    settings = {
        "server string": server_string,
        "workgroup": workgroup,
        "log level": str(log_level) if log_level is not None else "",
        "map to guest": map_to_guest,
        "usershare allow guests": "yes" if usershare_allow_guests is True else ("no" if usershare_allow_guests is False else ""),
    }

    for key, value in settings.items():
        if value:
            cp.set("global", key, value)
        elif cp.has_option("global", key):
            # Only remove if explicitly empty and existed before
            pass  # Leave existing values if new value is empty

    with SAMBA_CONF.open("w") as f:
        cp.write(f)

    await _reload_smbd()
    logger.info("Updated Samba global settings")


def export_managed_config() -> str:
    """Return the managed include file content as a string."""
    if INCLUDE_CONF.exists():
        return INCLUDE_CONF.read_text()
    return ""


async def import_managed_config(content: str) -> None:
    """Validate and write managed config, then reload smbd."""
    # Validate that configparser can parse it
    cp = configparser.ConfigParser()
    try:
        cp.read_string(content)
    except configparser.Error as e:
        raise ValueError(f"Invalid Samba config format: {e}")

    INCLUDE_CONF.write_text(content)
    await _reload_smbd()
    logger.info("Imported managed Samba config")
