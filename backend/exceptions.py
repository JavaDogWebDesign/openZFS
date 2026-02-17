"""ZFS exception hierarchy.

Maps ZFS CLI error patterns to structured exceptions with HTTP status codes.
Used by route handlers to return appropriate error responses.
"""

import re


class ZFSError(Exception):
    """Base exception for all ZFS/zpool command failures."""

    status_code: int = 500

    def __init__(self, message: str, stderr: str = "", returncode: int = 1) -> None:
        self.message = message
        self.stderr = stderr
        self.returncode = returncode
        super().__init__(message)


class ZFSNotFoundError(ZFSError):
    """Pool, dataset, snapshot, or bookmark does not exist."""

    status_code = 404


class ZFSExistsError(ZFSError):
    """Resource already exists."""

    status_code = 409


class ZFSBusyError(ZFSError):
    """Dataset is mounted, in use, or has dependents."""

    status_code = 409


class ZFSPermissionError(ZFSError):
    """Insufficient permissions for the operation."""

    status_code = 403


class ZFSInvalidArgumentError(ZFSError):
    """Invalid argument (bad property value, invalid vdev spec, etc.)."""

    status_code = 400


class ZFSHasHoldsError(ZFSError):
    """Snapshot has holds preventing destruction."""

    status_code = 409


class ZFSHasDependentsError(ZFSError):
    """Dataset has clones or other dependents preventing destruction."""

    status_code = 409


# --- Stderr pattern matching ---
# Ordered by specificity — first match wins.
_ERROR_PATTERNS: list[tuple[re.Pattern[str], type[ZFSError]]] = [
    (re.compile(r"dataset does not exist", re.IGNORECASE), ZFSNotFoundError),
    (re.compile(r"no such pool", re.IGNORECASE), ZFSNotFoundError),
    (re.compile(r"could not find", re.IGNORECASE), ZFSNotFoundError),
    (re.compile(r"does not exist", re.IGNORECASE), ZFSNotFoundError),
    (re.compile(r"already exists", re.IGNORECASE), ZFSExistsError),
    (re.compile(r"dataset is busy", re.IGNORECASE), ZFSBusyError),
    (re.compile(r"is busy", re.IGNORECASE), ZFSBusyError),
    (re.compile(r"has dependent clones", re.IGNORECASE), ZFSHasDependentsError),
    (re.compile(r"has children", re.IGNORECASE), ZFSHasDependentsError),
    (re.compile(r"snapshot .+ has holds", re.IGNORECASE), ZFSHasHoldsError),
    (re.compile(r"tag already exists", re.IGNORECASE), ZFSExistsError),
    (re.compile(r"permission denied", re.IGNORECASE), ZFSPermissionError),
    (re.compile(r"operation not permitted", re.IGNORECASE), ZFSPermissionError),
    (re.compile(r"invalid property", re.IGNORECASE), ZFSInvalidArgumentError),
    (re.compile(r"bad property value", re.IGNORECASE), ZFSInvalidArgumentError),
    (re.compile(r"invalid vdev specification", re.IGNORECASE), ZFSInvalidArgumentError),
    (re.compile(r"invalid option", re.IGNORECASE), ZFSInvalidArgumentError),
]


def parse_zfs_error(stderr: str, returncode: int = 1) -> ZFSError:
    """Parse ZFS/zpool stderr output and return the appropriate exception.

    Scans stderr for known error patterns and returns a specific exception
    type. Falls back to base ZFSError if no pattern matches.
    """
    for pattern, exc_class in _ERROR_PATTERNS:
        if pattern.search(stderr):
            # Use the first line of stderr as the user-facing message
            first_line = stderr.strip().split("\n")[0]
            return exc_class(message=first_line, stderr=stderr, returncode=returncode)

    # Fallback: generic ZFS error
    first_line = stderr.strip().split("\n")[0] if stderr.strip() else "Unknown ZFS error"
    return ZFSError(message=first_line, stderr=stderr, returncode=returncode)
