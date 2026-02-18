"""ZFS CLI wrapper — all zfs commands go through here.

Usage: see docs/ZFS-COMMANDS.md for the exact flags and output formats.
Always use -H (no header) and -p (parseable/raw) flags.
Parse TAB-delimited output, not spaces.
"""

import logging
from typing import Any

from exceptions import ZFSInvalidArgumentError, parse_zfs_error
from services.cmd import (
    run_cmd,
    validate_bookmark,
    validate_dataset_path,
    validate_pool_name,
    validate_property_name,
    validate_snapshot,
)

logger = logging.getLogger(__name__)


async def list_datasets(
    pool: str | None = None,
    dataset_type: str = "filesystem,volume",
    properties: list[str] | None = None,
) -> list[dict[str, Any]]:
    """List datasets using zfs list -Hp."""
    props = properties or ["name", "used", "avail", "refer", "mountpoint", "compression"]
    cmd = ["zfs", "list", "-Hp", "-o", ",".join(props), "-t", dataset_type]
    if pool:
        validate_pool_name(pool)
        cmd.extend(["-r", "--", pool])
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


async def list_snapshots(dataset: str) -> list[dict[str, Any]]:
    """List snapshots for a dataset."""
    validate_dataset_path(dataset)
    props = ["name", "used", "refer", "creation"]
    cmd = ["zfs", "list", "-Hp", "-o", ",".join(props), "-t", "snapshot", "-r", "--", dataset]
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


async def get_properties(dataset: str) -> dict[str, dict[str, str]]:
    """Get all properties for a dataset using zfs get all -Hp."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "get", "all", "-Hp", "--", dataset]
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


async def create_snapshot(dataset: str, name: str, recursive: bool = False) -> None:
    """Create a snapshot."""
    validate_dataset_path(dataset)
    snap_target = f"{dataset}@{name}"
    validate_snapshot(snap_target)

    cmd = ["zfs", "snapshot"]
    if recursive:
        cmd.append("-r")
    cmd.extend(["--", snap_target])

    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def destroy(target: str, recursive: bool = False, force: bool = False) -> None:
    """Destroy a dataset, snapshot, or bookmark. DESTRUCTIVE."""
    # Accept dataset paths, snapshot names (with @), or bookmark names (with #)
    if "@" in target:
        validate_snapshot(target)
    elif "#" in target:
        validate_bookmark(target)
    else:
        validate_dataset_path(target)

    cmd = ["zfs", "destroy"]
    if recursive:
        cmd.append("-r")
    if force:
        cmd.append("-f")
    cmd.extend(["--", target])

    logger.warning("Destroying ZFS target: %s", target)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Property management ---


async def set_property(dataset: str, prop: str, value: str) -> None:
    """Set a property on a dataset."""
    validate_dataset_path(dataset)
    validate_property_name(prop)
    cmd = ["zfs", "set", f"{prop}={value}", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def inherit_property(dataset: str, prop: str, recursive: bool = False) -> None:
    """Inherit a property from the parent dataset."""
    validate_dataset_path(dataset)
    validate_property_name(prop)
    cmd = ["zfs", "inherit"]
    if recursive:
        cmd.append("-r")
    cmd.extend(["--", prop, dataset])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Dataset operations ---


async def create_dataset(
    name: str,
    volume_size: str | None = None,
    properties: dict[str, str] | None = None,
) -> None:
    """Create a filesystem or volume."""
    validate_dataset_path(name)
    cmd = ["zfs", "create"]
    if volume_size:
        cmd.extend(["-V", volume_size])
    for k, v in (properties or {}).items():
        cmd.extend(["-o", f"{k}={v}"])
    cmd.extend(["--", name])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def rename(old: str, new: str) -> None:
    """Rename a dataset or snapshot."""
    validate_dataset_path(old) if "@" not in old else validate_snapshot(old)
    validate_dataset_path(new) if "@" not in new else validate_snapshot(new)
    cmd = ["zfs", "rename", "--", old, new]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Mount/unmount ---


async def mount(dataset: str) -> None:
    """Mount a ZFS filesystem."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "mount", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def unmount(dataset: str, force: bool = False) -> None:
    """Unmount a ZFS filesystem."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "unmount"]
    if force:
        cmd.append("-f")
    cmd.extend(["--", dataset])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Sharing ---


async def share(dataset: str) -> None:
    """Share a ZFS filesystem."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "share", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def unshare(dataset: str) -> None:
    """Unshare a ZFS filesystem."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "unshare", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Snapshots: clone, promote, rollback ---


async def clone(snapshot: str, target: str, properties: dict[str, str] | None = None) -> None:
    """Create a writable clone from a snapshot."""
    validate_snapshot(snapshot)
    validate_dataset_path(target)
    cmd = ["zfs", "clone"]
    for k, v in (properties or {}).items():
        cmd.extend(["-o", f"{k}={v}"])
    cmd.extend(["--", snapshot, target])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def promote(dataset: str) -> None:
    """Promote a clone to be independent of its origin."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "promote", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def rollback(snapshot: str, destroy_newer: bool = False, force: bool = False) -> None:
    """Revert a dataset to a snapshot. DESTRUCTIVE."""
    validate_snapshot(snapshot)
    cmd = ["zfs", "rollback"]
    if destroy_newer:
        cmd.append("-r")
    if force:
        cmd.append("-f")
    cmd.extend(["--", snapshot])
    logger.warning("Rolling back to snapshot: %s", snapshot)
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


# --- Holds ---


async def hold(tag: str, snapshot: str) -> None:
    """Place a hold on a snapshot."""
    validate_snapshot(snapshot)
    cmd = ["zfs", "hold", "--", tag, snapshot]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def release(tag: str, snapshot: str) -> None:
    """Release a hold on a snapshot."""
    validate_snapshot(snapshot)
    cmd = ["zfs", "release", "--", tag, snapshot]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def holds(snapshot: str) -> list[dict[str, str]]:
    """List holds on a snapshot."""
    validate_snapshot(snapshot)
    cmd = ["zfs", "holds", "-H", "--", snapshot]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    results = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 3:
            results.append({"name": parts[0], "tag": parts[1], "timestamp": parts[2]})
    return results


# --- Diff ---


async def diff(snap_or_dataset_a: str, snap_or_dataset_b: str) -> list[dict[str, str | None]]:
    """Show differences between two snapshots or snapshot vs current."""
    cmd = ["zfs", "diff", "--", snap_or_dataset_a, snap_or_dataset_b]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    results = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        # Format: M\t/path or R\t/old\t/new
        parts = line.split("\t")
        entry: dict[str, str | None] = {"change_type": parts[0], "path": parts[1] if len(parts) > 1 else ""}
        entry["new_path"] = parts[2] if len(parts) > 2 else None
        results.append(entry)
    return results


# --- Bookmarks ---


async def bookmark(snapshot: str, bookmark_name: str) -> None:
    """Create a bookmark from a snapshot."""
    validate_snapshot(snapshot)
    dataset = snapshot.split("@")[0]
    full_bookmark = f"{dataset}#{bookmark_name}"
    validate_bookmark(full_bookmark)
    cmd = ["zfs", "bookmark", "--", snapshot, full_bookmark]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def list_bookmarks(dataset: str) -> list[dict[str, str]]:
    """List bookmarks for a dataset."""
    validate_dataset_path(dataset)
    props = ["name", "creation"]
    cmd = ["zfs", "list", "-Hp", "-o", ",".join(props), "-t", "bookmark", "-r", "--", dataset]
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


# --- Encryption ---


async def load_key(dataset: str, passphrase: str | None = None, key_file: str | None = None) -> None:
    """Load an encryption key for a dataset."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "load-key"]
    if key_file:
        cmd.extend(["-L", f"file://{key_file}"])
    cmd.extend(["--", dataset])
    if passphrase:
        # Pass via stdin
        import asyncio
        async with __import__("services.cmd", fromlist=["_zfs_semaphore"])._zfs_semaphore:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await proc.communicate(input=passphrase.encode() + b"\n")
            if proc.returncode != 0:
                raise parse_zfs_error(stderr_bytes.decode(), proc.returncode)
    else:
        stdout, stderr, rc = await run_cmd(cmd)
        if rc != 0:
            raise parse_zfs_error(stderr, rc)


async def unload_key(dataset: str) -> None:
    """Unload an encryption key for a dataset."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "unload-key", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def change_key(dataset: str, new_passphrase: str | None = None, new_key_file: str | None = None) -> None:
    """Change the encryption key for a dataset."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "change-key"]
    if new_key_file:
        cmd.extend(["-o", f"keylocation=file://{new_key_file}", "-o", "keyformat=raw"])
    elif new_passphrase:
        cmd.extend(["-o", "keyformat=passphrase"])
    cmd.extend(["--", dataset])
    if new_passphrase and not new_key_file:
        import asyncio
        from services.cmd import _zfs_semaphore
        async with _zfs_semaphore:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await proc.communicate(input=new_passphrase.encode() + b"\n")
            if proc.returncode != 0:
                raise parse_zfs_error(stderr_bytes.decode(), proc.returncode)
    else:
        stdout, stderr, rc = await run_cmd(cmd)
        if rc != 0:
            raise parse_zfs_error(stderr, rc)


# --- Permissions / Delegation ---


async def allow(dataset: str, entity: str, permissions: list[str], entity_type: str = "user") -> None:
    """Delegate ZFS permissions."""
    validate_dataset_path(dataset)
    if entity.startswith("-"):
        raise ZFSInvalidArgumentError("Invalid entity name")
    perms = ",".join(permissions)
    cmd = ["zfs", "allow"]
    if entity_type == "group":
        cmd.append("-g")
    cmd.extend([entity, perms, "--", dataset])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def unallow(dataset: str, entity: str, permissions: list[str], entity_type: str = "user") -> None:
    """Remove delegated ZFS permissions."""
    validate_dataset_path(dataset)
    if entity.startswith("-"):
        raise ZFSInvalidArgumentError("Invalid entity name")
    perms = ",".join(permissions)
    cmd = ["zfs", "unallow"]
    if entity_type == "group":
        cmd.append("-g")
    cmd.extend([entity, perms, "--", dataset])
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)


async def get_permissions(dataset: str) -> str:
    """Get delegated permissions for a dataset (returns raw text)."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "allow", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    return stdout


# --- Space accounting ---


async def userspace(dataset: str) -> list[dict[str, str]]:
    """Get per-user space usage."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "userspace", "-Hp", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    results = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 5:
            results.append({"type": parts[0], "name": parts[1], "used": parts[2], "quota": parts[3], "objused": parts[4]})
    return results


async def groupspace(dataset: str) -> list[dict[str, str]]:
    """Get per-group space usage."""
    validate_dataset_path(dataset)
    cmd = ["zfs", "groupspace", "-Hp", "--", dataset]
    stdout, stderr, rc = await run_cmd(cmd)
    if rc != 0:
        raise parse_zfs_error(stderr, rc)
    results = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 5:
            results.append({"type": parts[0], "name": parts[1], "used": parts[2], "quota": parts[3], "objused": parts[4]})
    return results


# --- Send (for replication) ---


async def send_size_estimate(snapshot: str, incremental_from: str | None = None) -> int:
    """Estimate the size of a send stream in bytes."""
    validate_snapshot(snapshot)
    cmd = ["zfs", "send", "-nvP"]
    if incremental_from:
        cmd.extend(["-i", incremental_from])
    cmd.extend(["--", snapshot])
    stdout, stderr, rc = await run_cmd(cmd)
    # Size is in stderr for -n flag
    output = stderr + stdout
    for line in output.split("\n"):
        if "size" in line.lower():
            parts = line.strip().split()
            for p in parts:
                if p.isdigit():
                    return int(p)
    return 0
