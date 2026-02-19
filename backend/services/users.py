"""System user and group management via CLI commands."""

import asyncio
import logging
import re

from services import samba

logger = logging.getLogger(__name__)

USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")

# Groups to always show even if GID < 1000
SPECIAL_GROUPS = {"sambashare", "sudo", "docker"}

# Password hash prefixes that indicate a real (non-empty) hashed password
_HASH_PREFIXES = ("$1$", "$2", "$5$", "$6$", "$y$")


async def _get_locked_users(usernames: list[str]) -> set[str]:
    """Determine which users are explicitly locked via shadow hash inspection.

    An account is 'locked' only when its shadow hash is '!' followed by a real
    password hash (e.g. '!$6$...').  Hashes like '!!', '!', '*', or empty mean
    'no password set' — not 'locked'.
    """
    proc = await asyncio.create_subprocess_exec(
        "getent", "shadow",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        return set()

    shadow_map: dict[str, str] = {}
    for line in stdout.decode().strip().splitlines():
        parts = line.split(":")
        if len(parts) >= 2:
            shadow_map[parts[0]] = parts[1]

    locked: set[str] = set()
    target = set(usernames)
    for uname, pw_hash in shadow_map.items():
        if uname not in target:
            continue
        # Locked = hash starts with '!' and has a real hash underneath
        if pw_hash.startswith("!") and any(
            pw_hash[1:].startswith(p) for p in _HASH_PREFIXES
        ):
            locked.add(uname)
    return locked


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

    usernames = []
    raw_users = []
    for line in stdout.decode().strip().splitlines():
        parts = line.split(":")
        if len(parts) < 7:
            continue
        uid = int(parts[2])
        username = parts[0]
        if uid < 1000 or username == "nobody":
            continue
        raw_users.append({
            "username": username,
            "uid": uid,
            "gid": int(parts[3]),
            "full_name": parts[4].split(",")[0] if parts[4] else "",
            "home": parts[5],
            "shell": parts[6],
        })
        usernames.append(username)

    # Determine lock status via shadow hash inspection
    locked_set = await _get_locked_users(usernames)

    for u in raw_users:
        u["locked"] = u["username"] in locked_set

    return raw_users


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


# --- Account management ---


async def lock_account(username: str) -> None:
    """Lock a user account via usermod -L."""
    proc = await asyncio.create_subprocess_exec(
        "usermod", "-L", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to lock account '{username}': {stderr.decode().strip()}")
    logger.info("Locked account: %s", username)


async def unlock_account(username: str) -> None:
    """Unlock a user account via usermod -U.

    We use usermod -U instead of passwd -u because passwd -u refuses to
    unlock accounts that would become passwordless (exit code 1).
    """
    proc = await asyncio.create_subprocess_exec(
        "usermod", "-U", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to unlock account '{username}': {stderr.decode().strip()}")
    logger.info("Unlocked account: %s", username)


async def force_password_change(username: str) -> None:
    """Force password change on next login via passwd -e."""
    proc = await asyncio.create_subprocess_exec(
        "passwd", "-e", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to expire password for '{username}': {stderr.decode().strip()}")
    logger.info("Forced password change for: %s", username)


async def set_account_expiration(username: str, expire_date: str = "", max_days: int | None = None) -> None:
    """Set account expiration date and/or max password age via chage."""
    if expire_date:
        proc = await asyncio.create_subprocess_exec(
            "chage", "-E", expire_date, username,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"Failed to set expiration for '{username}': {stderr.decode().strip()}")
    elif expire_date == "":
        # Remove expiration
        proc = await asyncio.create_subprocess_exec(
            "chage", "-E", "-1", username,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"Failed to remove expiration for '{username}': {stderr.decode().strip()}")

    if max_days is not None:
        proc = await asyncio.create_subprocess_exec(
            "chage", "-M", str(max_days), username,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"Failed to set max password days for '{username}': {stderr.decode().strip()}")

    logger.info("Updated expiration for: %s", username)


async def get_account_status(username: str) -> dict:
    """Get account lock/expiration status."""
    result: dict = {"locked": False, "expire_date": "", "max_days": None, "last_change": "", "password_expires": ""}

    # Shadow hash inspection for lock status
    locked_set = await _get_locked_users([username])
    result["locked"] = username in locked_set

    # chage -l
    proc = await asyncio.create_subprocess_exec(
        "chage", "-l", username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode == 0:
        for line in stdout.decode().strip().splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if "account expires" in key:
                result["expire_date"] = "" if value == "never" else value
            elif "maximum number of days" in key:
                try:
                    result["max_days"] = int(value)
                except ValueError:
                    result["max_days"] = None
            elif "last password change" in key:
                result["last_change"] = value
            elif "password expires" in key:
                result["password_expires"] = value

    return result


async def list_shells() -> list[str]:
    """Read /etc/shells and return list of valid shells."""
    shells = []
    try:
        with open("/etc/shells") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    shells.append(line)
    except FileNotFoundError:
        shells = ["/bin/bash", "/bin/sh"]
    return shells


async def change_shell(username: str, shell: str) -> None:
    """Change a user's login shell. Validates against /etc/shells."""
    valid_shells = await list_shells()
    if shell not in valid_shells:
        raise ValueError(f"Invalid shell '{shell}'. Must be one of: {', '.join(valid_shells)}")

    proc = await asyncio.create_subprocess_exec(
        "usermod", "-s", shell, username,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to change shell for '{username}': {stderr.decode().strip()}")
    logger.info("Changed shell for %s to %s", username, shell)


async def rename_group(old_name: str, new_name: str) -> None:
    """Rename a system group."""
    _validate_name(new_name, "group name")
    proc = await asyncio.create_subprocess_exec(
        "groupmod", "-n", new_name, old_name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to rename group '{old_name}' to '{new_name}': {stderr.decode().strip()}")
    logger.info("Renamed group %s to %s", old_name, new_name)
