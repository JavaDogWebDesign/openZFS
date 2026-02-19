"""System user and group management via CLI commands."""

import asyncio
import logging
import re

from services import samba

logger = logging.getLogger(__name__)

USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")

# Groups to always show even if GID < 1000
SPECIAL_GROUPS = {"sambashare", "sudo", "docker"}


def _validate_name(name: str, kind: str = "username") -> None:
    """Validate a username or group name."""
    if not USERNAME_RE.match(name):
        raise ValueError(
            f"Invalid {kind}: must start with lowercase letter or underscore, "
            f"contain only lowercase letters, digits, underscores, hyphens, "
            f"and be 1-32 characters long"
        )


async def list_system_users() -> list[dict]:
    """List system users with UID >= 1000, excluding nobody."""
    proc = await asyncio.create_subprocess_exec(
        "getent", "passwd",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"getent passwd failed: {stderr.decode().strip()}")

    users = []
    for line in stdout.decode().strip().splitlines():
        parts = line.split(":")
        if len(parts) < 7:
            continue
        uid = int(parts[2])
        username = parts[0]
        if uid < 1000 or username == "nobody":
            continue
        users.append({
            "username": username,
            "uid": uid,
            "gid": int(parts[3]),
            "full_name": parts[4].split(",")[0] if parts[4] else "",
            "home": parts[5],
            "shell": parts[6],
        })
    return users


async def create_system_user(username: str, password: str, full_name: str = "") -> None:
    """Create a new system user with a home directory."""
    _validate_name(username)

    cmd = ["useradd", "-m", "-s", "/bin/bash"]
    if full_name:
        cmd.extend(["-c", full_name])
    cmd.append(username)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to create user '{username}': {err}")

    # Set password via chpasswd
    proc = await asyncio.create_subprocess_exec(
        "chpasswd",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=f"{username}:{password}\n".encode())
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"User created but failed to set password: {err}")

    logger.info("Created system user: %s", username)


async def delete_system_user(username: str) -> None:
    """Delete a system user. Removes from SMB first, then deletes with userdel -r."""
    _validate_name(username)

    # Remove from SMB first (ignore errors if not an SMB user)
    try:
        await samba.remove_user(username)
    except Exception:
        pass

    proc = await asyncio.create_subprocess_exec(
        "userdel", "-r", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to delete user '{username}': {err}")

    logger.info("Deleted system user: %s", username)


async def change_system_password(username: str, password: str) -> None:
    """Change a system user's password."""
    proc = await asyncio.create_subprocess_exec(
        "chpasswd",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=f"{username}:{password}\n".encode())
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to change password for '{username}': {err}")

    logger.info("Changed system password for: %s", username)


async def list_groups() -> list[dict]:
    """List groups with GID >= 1000 plus special groups."""
    proc = await asyncio.create_subprocess_exec(
        "getent", "group",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"getent group failed: {stderr.decode().strip()}")

    groups = []
    for line in stdout.decode().strip().splitlines():
        parts = line.split(":")
        if len(parts) < 4:
            continue
        gid = int(parts[2])
        name = parts[0]
        members = [m for m in parts[3].split(",") if m]
        if gid >= 1000 or name in SPECIAL_GROUPS:
            groups.append({
                "name": name,
                "gid": gid,
                "members": members,
            })
    return groups


async def create_group(name: str) -> None:
    """Create a new system group."""
    _validate_name(name, "group name")

    proc = await asyncio.create_subprocess_exec(
        "groupadd", name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to create group '{name}': {err}")

    logger.info("Created group: %s", name)


async def delete_group(name: str) -> None:
    """Delete a system group."""
    proc = await asyncio.create_subprocess_exec(
        "groupdel", name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to delete group '{name}': {err}")

    logger.info("Deleted group: %s", name)


async def add_user_to_group(username: str, group: str) -> None:
    """Add a user to a group."""
    proc = await asyncio.create_subprocess_exec(
        "usermod", "-aG", group, username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to add '{username}' to group '{group}': {err}")

    logger.info("Added %s to group %s", username, group)


async def remove_user_from_group(username: str, group: str) -> None:
    """Remove a user from a group."""
    proc = await asyncio.create_subprocess_exec(
        "gpasswd", "-d", username, group,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Failed to remove '{username}' from group '{group}': {err}")

    logger.info("Removed %s from group %s", username, group)
