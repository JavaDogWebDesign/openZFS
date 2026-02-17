"""Shared command runner and input validation for ZFS/zpool CLI wrappers.

All subprocess calls to zfs/zpool go through run_cmd().
All user-supplied names are validated before being passed to commands.
A semaphore limits concurrent ZFS subprocess calls to avoid overloading.
"""

import asyncio
import logging
import re

logger = logging.getLogger(__name__)

# Limit concurrent ZFS subprocess calls (zpool status, zfs list, etc. are expensive)
_zfs_semaphore = asyncio.Semaphore(4)

# --- Validation patterns ---
# ZFS pool names: start with letter, contain alphanumeric, underscore, dash, dot
_POOL_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.\-]*$")

# ZFS dataset paths: pool/dataset/child — letters, digits, _, -, ., /
_DATASET_PATH_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.\-/]*$")

# Snapshot part (after @): alphanumeric, _, -, ., :, %
_SNAP_PART_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:\-%]*$")

# Bookmark part (after #): same as snapshot part
_BOOKMARK_PART_RE = _SNAP_PART_RE

# ZFS property names: lowercase, with dots and colons for user properties
_PROPERTY_NAME_RE = re.compile(r"^[a-z][a-z0-9_.:]*$")


class ValidationError(ValueError):
    """Raised when a ZFS name or argument fails validation."""


def validate_pool_name(name: str) -> str:
    """Validate and return a ZFS pool name."""
    if not name or not _POOL_NAME_RE.match(name):
        raise ValidationError(
            f"Invalid pool name: {name!r}. "
            "Must start with a letter and contain only [a-zA-Z0-9_.-]"
        )
    return name


def validate_dataset_path(path: str) -> str:
    """Validate and return a ZFS dataset path (pool/dataset/child)."""
    if not path or not _DATASET_PATH_RE.match(path):
        raise ValidationError(
            f"Invalid dataset path: {path!r}. "
            "Must start with a letter and contain only [a-zA-Z0-9_.-/]"
        )
    # Reject paths with double slashes, leading/trailing slashes
    if "//" in path or path.startswith("/") or path.endswith("/"):
        raise ValidationError(f"Invalid dataset path: {path!r}. Malformed path separators.")
    return path


def validate_snapshot(name: str) -> str:
    """Validate and return a full snapshot name (dataset@snap)."""
    if "@" not in name:
        raise ValidationError(f"Invalid snapshot name: {name!r}. Must contain '@'.")
    dataset_part, snap_part = name.split("@", 1)
    validate_dataset_path(dataset_part)
    if not snap_part or not _SNAP_PART_RE.match(snap_part):
        raise ValidationError(
            f"Invalid snapshot suffix: {snap_part!r}. "
            "Must start with alphanumeric and contain only [a-zA-Z0-9_.:-]"
        )
    return name


def validate_bookmark(name: str) -> str:
    """Validate and return a full bookmark name (dataset#bookmark)."""
    if "#" not in name:
        raise ValidationError(f"Invalid bookmark name: {name!r}. Must contain '#'.")
    dataset_part, bookmark_part = name.split("#", 1)
    validate_dataset_path(dataset_part)
    if not bookmark_part or not _BOOKMARK_PART_RE.match(bookmark_part):
        raise ValidationError(
            f"Invalid bookmark suffix: {bookmark_part!r}. "
            "Must start with alphanumeric and contain only [a-zA-Z0-9_.:-]"
        )
    return name


def validate_property_name(name: str) -> str:
    """Validate a ZFS property name."""
    if not name or not _PROPERTY_NAME_RE.match(name):
        raise ValidationError(
            f"Invalid property name: {name!r}. "
            "Must be lowercase and contain only [a-z0-9_.:]"
        )
    return name


async def run_cmd(cmd: list[str]) -> tuple[str, str, int]:
    """Run a shell command with concurrency limiting.

    Returns (stdout, stderr, returncode).
    All ZFS/zpool subprocess calls should go through this function.
    """
    async with _zfs_semaphore:
        logger.debug("Running command: %s", " ".join(cmd))
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            binary = cmd[0] if cmd else "(empty)"
            logger.error("Command not found: %s", binary)
            return "", f"{binary}: command not found", 127
        stdout, stderr = await proc.communicate()
        return stdout.decode(), stderr.decode(), proc.returncode
