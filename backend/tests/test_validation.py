"""Tests for services/cmd.py — validation functions and run_cmd.

Covers:
- validate_pool_name: valid names, invalid names, edge cases
- validate_dataset_path: simple paths, nested paths, malformed separators
- validate_snapshot: dataset@snap format, missing @, bad suffixes
- validate_bookmark: dataset#bookmark format, missing #, bad suffixes
- validate_property_name: lowercase with dots/colons, rejected uppercase
- run_cmd: verify it returns (stdout, stderr, returncode) and respects semaphore
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from services.cmd import (
    ValidationError,
    validate_pool_name,
    validate_dataset_path,
    validate_snapshot,
    validate_bookmark,
    validate_property_name,
    run_cmd,
)


# ===================================================================
# validate_pool_name
# ===================================================================


class TestValidatePoolName:
    """Pool names must start with a letter; allowed chars: [a-zA-Z0-9_.-]"""

    @pytest.mark.parametrize("name", [
        "tank",
        "mypool",
        "Pool1",
        "data-store",
        "backup_01",
        "rpool.mirror",
        "Z",
        "a",
    ])
    def test_valid_pool_names(self, name):
        assert validate_pool_name(name) == name

    @pytest.mark.parametrize("name,reason", [
        ("", "empty string"),
        ("1pool", "starts with digit"),
        ("_pool", "starts with underscore"),
        ("-pool", "starts with dash"),
        (".pool", "starts with dot"),
        ("pool name", "contains space"),
        ("pool/child", "contains slash — that's a dataset path"),
        ("pool@snap", "contains @ — that's a snapshot"),
        ("pool#mark", "contains # — that's a bookmark"),
        ("pool!", "contains exclamation mark"),
        ("pool;drop", "contains semicolon (injection attempt)"),
    ])
    def test_invalid_pool_names(self, name, reason):
        with pytest.raises(ValidationError):
            validate_pool_name(name)

    def test_none_raises(self):
        """None is not a valid pool name."""
        with pytest.raises((ValidationError, TypeError)):
            validate_pool_name(None)


# ===================================================================
# validate_dataset_path
# ===================================================================


class TestValidateDatasetPath:
    """Dataset paths: pool/dataset/child, no double slashes, no leading/trailing slash."""

    @pytest.mark.parametrize("path", [
        "tank",
        "tank/data",
        "tank/data/child",
        "rpool/ROOT/ubuntu",
        "myPool/ds-01/sub_dir.v2",
        "A/B/C/D/E",
    ])
    def test_valid_dataset_paths(self, path):
        assert validate_dataset_path(path) == path

    @pytest.mark.parametrize("path,reason", [
        ("", "empty string"),
        ("1tank/data", "starts with digit"),
        ("/tank/data", "leading slash"),
        ("tank/data/", "trailing slash"),
        ("tank//data", "double slash"),
        ("tank/data child", "contains space"),
        ("tank/data@snap", "contains @ — use validate_snapshot"),
        ("tank/data#mark", "contains # — use validate_bookmark"),
    ])
    def test_invalid_dataset_paths(self, path, reason):
        with pytest.raises(ValidationError):
            validate_dataset_path(path)

    def test_single_component_is_valid(self):
        """A pool name alone is also a valid dataset path."""
        assert validate_dataset_path("tank") == "tank"


# ===================================================================
# validate_snapshot
# ===================================================================


class TestValidateSnapshot:
    """Snapshot names: dataset@snapname."""

    @pytest.mark.parametrize("name", [
        "tank@snap1",
        "tank/data@daily-2024-01-15",
        "rpool/ROOT@autosnap_2024-01-15_00:00:00_hourly",
        "pool/ds@v1.2.3",
        "pool/ds@backup%20tag",
    ])
    def test_valid_snapshots(self, name):
        assert validate_snapshot(name) == name

    def test_missing_at_sign(self):
        with pytest.raises(ValidationError, match="Must contain '@'"):
            validate_snapshot("tank/data")

    def test_empty_snap_part(self):
        with pytest.raises(ValidationError):
            validate_snapshot("tank/data@")

    def test_snap_part_starts_with_special(self):
        """Snap suffix must start with alphanumeric."""
        with pytest.raises(ValidationError):
            validate_snapshot("tank@.hidden")

    def test_invalid_dataset_part(self):
        """The dataset portion before @ must also be valid."""
        with pytest.raises(ValidationError):
            validate_snapshot("1bad@snap1")


# ===================================================================
# validate_bookmark
# ===================================================================


class TestValidateBookmark:
    """Bookmark names: dataset#bookmarkname."""

    @pytest.mark.parametrize("name", [
        "tank#mark1",
        "tank/data#daily-2024-01-15",
        "rpool/ROOT#bm_v1.2.3",
    ])
    def test_valid_bookmarks(self, name):
        assert validate_bookmark(name) == name

    def test_missing_hash(self):
        with pytest.raises(ValidationError, match="Must contain '#'"):
            validate_bookmark("tank/data")

    def test_empty_bookmark_part(self):
        with pytest.raises(ValidationError):
            validate_bookmark("tank/data#")

    def test_bookmark_starts_with_special(self):
        with pytest.raises(ValidationError):
            validate_bookmark("tank#.hidden")

    def test_invalid_dataset_part(self):
        with pytest.raises(ValidationError):
            validate_bookmark("1bad#mark1")


# ===================================================================
# validate_property_name
# ===================================================================


class TestValidatePropertyName:
    """Property names: lowercase, [a-z0-9_.:]"""

    @pytest.mark.parametrize("name", [
        "compression",
        "mountpoint",
        "atime",
        "com.sun:autosnapshot",
        "org.openzfs:custom",
        "recordsize",
        "quota",
    ])
    def test_valid_property_names(self, name):
        assert validate_property_name(name) == name

    @pytest.mark.parametrize("name,reason", [
        ("", "empty string"),
        ("Compression", "uppercase letter"),
        ("ATIME", "all uppercase"),
        ("mount point", "contains space"),
        ("quota;rm", "injection attempt"),
        ("1prop", "starts with digit"),
    ])
    def test_invalid_property_names(self, name, reason):
        with pytest.raises(ValidationError):
            validate_property_name(name)


# ===================================================================
# run_cmd (async)
# ===================================================================


class TestRunCmd:
    """Test the async command runner."""

    @pytest.mark.asyncio
    async def test_run_cmd_returns_tuple(self):
        """run_cmd should return (stdout, stderr, returncode)."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate.return_value = (b"output\n", b"")
            mock_proc.returncode = 0
            mock_exec.return_value = mock_proc

            stdout, stderr, rc = await run_cmd(["echo", "hello"])

            assert stdout == "output\n"
            assert stderr == ""
            assert rc == 0

    @pytest.mark.asyncio
    async def test_run_cmd_captures_stderr(self):
        """run_cmd should capture stderr from failed commands."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate.return_value = (b"", b"cannot open: no such pool\n")
            mock_proc.returncode = 1
            mock_exec.return_value = mock_proc

            stdout, stderr, rc = await run_cmd(["zpool", "status", "nonexistent"])

            assert stderr == "cannot open: no such pool\n"
            assert rc == 1

    @pytest.mark.asyncio
    async def test_run_cmd_passes_command_to_subprocess(self):
        """run_cmd should pass the exact command list to create_subprocess_exec."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate.return_value = (b"", b"")
            mock_proc.returncode = 0
            mock_exec.return_value = mock_proc

            await run_cmd(["zfs", "list", "-Hp", "-o", "name"])

            mock_exec.assert_called_once()
            args = mock_exec.call_args[0]
            assert args == ("zfs", "list", "-Hp", "-o", "name")
