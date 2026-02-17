"""Tests for exceptions.py — ZFS error hierarchy and parse_zfs_error.

Covers:
- Each concrete exception class has the correct status_code
- parse_zfs_error matches every documented stderr pattern to the right exception
- Multiline stderr: first line is used as the user-facing message
- Unknown/unmatched stderr falls back to base ZFSError (500)
- Empty stderr falls back gracefully
"""

import pytest

from exceptions import (
    ZFSError,
    ZFSNotFoundError,
    ZFSExistsError,
    ZFSBusyError,
    ZFSPermissionError,
    ZFSInvalidArgumentError,
    ZFSHasHoldsError,
    ZFSHasDependentsError,
    parse_zfs_error,
)


# ===================================================================
# Exception class attributes
# ===================================================================


class TestExceptionStatusCodes:
    """Each exception subclass must carry the right HTTP status code."""

    def test_base_error_is_500(self):
        assert ZFSError.status_code == 500

    def test_not_found_is_404(self):
        assert ZFSNotFoundError.status_code == 404

    def test_exists_is_409(self):
        assert ZFSExistsError.status_code == 409

    def test_busy_is_409(self):
        assert ZFSBusyError.status_code == 409

    def test_permission_is_403(self):
        assert ZFSPermissionError.status_code == 403

    def test_invalid_argument_is_400(self):
        assert ZFSInvalidArgumentError.status_code == 400

    def test_has_holds_is_409(self):
        assert ZFSHasHoldsError.status_code == 409

    def test_has_dependents_is_409(self):
        assert ZFSHasDependentsError.status_code == 409


class TestExceptionAttributes:
    """Exceptions store message, stderr, and returncode."""

    def test_stores_message(self):
        e = ZFSError("something went wrong", stderr="full output", returncode=2)
        assert e.message == "something went wrong"
        assert e.stderr == "full output"
        assert e.returncode == 2
        assert str(e) == "something went wrong"

    def test_default_values(self):
        e = ZFSError("oops")
        assert e.stderr == ""
        assert e.returncode == 1


# ===================================================================
# parse_zfs_error — pattern matching
# ===================================================================


class TestParseZfsErrorNotFound:
    """Patterns that should produce ZFSNotFoundError (404)."""

    @pytest.mark.parametrize("stderr", [
        "cannot open 'tank/missing': dataset does not exist",
        "cannot open 'tank/missing': dataset does not exist\n",
        "cannot open 'badpool': no such pool 'badpool'",
        "internal error: Could not find dataset 'tank/orphan'",
        "cannot unmount 'tank/gone': filesystem does not exist",
    ])
    def test_not_found_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSNotFoundError)
        assert exc.status_code == 404
        assert exc.returncode == 1


class TestParseZfsErrorExists:
    """Patterns that should produce ZFSExistsError (409)."""

    @pytest.mark.parametrize("stderr", [
        "cannot create 'tank/data': dataset already exists",
        "cannot create snapshot 'tank@snap1': dataset already exists",
        "cannot hold snapshot 'tank@snap1': tag already exists on this snapshot",
    ])
    def test_exists_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSExistsError)
        assert exc.status_code == 409


class TestParseZfsErrorBusy:
    """Patterns that should produce ZFSBusyError (409)."""

    @pytest.mark.parametrize("stderr", [
        "cannot unmount 'tank/data': dataset is busy",
        "cannot destroy 'tank/data': filesystem is busy",
    ])
    def test_busy_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSBusyError)
        assert exc.status_code == 409


class TestParseZfsErrorDependents:
    """Patterns that should produce ZFSHasDependentsError (409)."""

    @pytest.mark.parametrize("stderr", [
        "cannot destroy 'tank@snap1': snapshot has dependent clones",
        "cannot destroy 'tank/data': filesystem has children",
    ])
    def test_dependents_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSHasDependentsError)
        assert exc.status_code == 409


class TestParseZfsErrorHolds:
    """Patterns that should produce ZFSHasHoldsError (409)."""

    @pytest.mark.parametrize("stderr", [
        "cannot destroy 'tank@snap1': snapshot 'tank@snap1' has holds",
        "cannot destroy snapshot tank@snap1: snapshot tank@snap1 has holds",
    ])
    def test_holds_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSHasHoldsError)
        assert exc.status_code == 409


class TestParseZfsErrorPermission:
    """Patterns that should produce ZFSPermissionError (403)."""

    @pytest.mark.parametrize("stderr", [
        "cannot create 'tank/data': permission denied",
        "cannot mount 'tank/data': Operation not permitted",
    ])
    def test_permission_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSPermissionError)
        assert exc.status_code == 403


class TestParseZfsErrorInvalidArgument:
    """Patterns that should produce ZFSInvalidArgumentError (400)."""

    @pytest.mark.parametrize("stderr", [
        "cannot set property: invalid property 'fakeprop'",
        "cannot set property for 'tank/data': bad property value 'abc' for 'quota'",
        "cannot create 'pool': invalid vdev specification",
        "invalid option 'X'",
    ])
    def test_invalid_argument_patterns(self, stderr):
        exc = parse_zfs_error(stderr, returncode=1)
        assert isinstance(exc, ZFSInvalidArgumentError)
        assert exc.status_code == 400


class TestParseZfsErrorFallback:
    """Unrecognised stderr should fall back to base ZFSError (500)."""

    def test_unknown_pattern(self):
        exc = parse_zfs_error("some totally unknown error output", returncode=2)
        assert type(exc) is ZFSError  # exact type, not subclass
        assert exc.status_code == 500
        assert exc.returncode == 2

    def test_empty_stderr(self):
        exc = parse_zfs_error("", returncode=1)
        assert type(exc) is ZFSError
        assert exc.message == "Unknown ZFS error"

    def test_whitespace_only_stderr(self):
        exc = parse_zfs_error("   \n  \n", returncode=1)
        assert type(exc) is ZFSError
        assert exc.message == "Unknown ZFS error"


class TestParseZfsErrorMessage:
    """parse_zfs_error should use the first line of stderr as the message."""

    def test_multiline_stderr_uses_first_line(self):
        stderr = (
            "cannot destroy 'tank@snap1': snapshot has dependent clones\n"
            "use '-R' to destroy the following datasets:\n"
            "tank/clone1\n"
        )
        exc = parse_zfs_error(stderr, returncode=1)
        assert exc.message == "cannot destroy 'tank@snap1': snapshot has dependent clones"
        # Full stderr is preserved
        assert exc.stderr == stderr

    def test_case_insensitive_matching(self):
        """Patterns should match regardless of case."""
        exc = parse_zfs_error("DATASET DOES NOT EXIST", returncode=1)
        assert isinstance(exc, ZFSNotFoundError)

        exc = parse_zfs_error("Permission Denied", returncode=1)
        assert isinstance(exc, ZFSPermissionError)
