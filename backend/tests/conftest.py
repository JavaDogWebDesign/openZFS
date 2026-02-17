"""Shared fixtures for the ZFS Manager test suite.

Provides:
- sys.path setup so imports work like the backend does (from services.cmd, etc.)
- In-memory SQLite database fixture for pure async db tests
- FastAPI TestClient with mocked auth dependency and in-app db patching
- Mock subprocess fixture (prevents real ZFS/zpool calls)
"""

import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import aiosqlite

# --- Path setup: backend/ must be on sys.path so bare imports work ---
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import db as db_module


# ---------------------------------------------------------------------------
# In-memory database fixture (for pure async tests like test_db.py)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def test_db():
    """Create an in-memory SQLite database with the full schema.

    Sets db_module._db directly so all db module functions (create_session,
    get_session, audit_log, etc.) use the in-memory database instead of
    the on-disk one.  The get_db() function checks ``if _db is None`` and
    returns _db immediately when it is already set.
    """
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(db_module.SCHEMA)
    await conn.commit()

    original_db = db_module._db
    db_module._db = conn

    yield conn

    db_module._db = original_db
    await conn.close()


# ---------------------------------------------------------------------------
# Mock subprocess fixture -- prevents real ZFS commands
# ---------------------------------------------------------------------------

def make_run_cmd_mock(stdout: str = "", stderr: str = "", returncode: int = 0):
    """Factory: create an AsyncMock for run_cmd with preset output."""
    mock = AsyncMock(return_value=(stdout, stderr, returncode))
    return mock


@pytest.fixture
def mock_run_cmd():
    """Patch services.cmd.run_cmd globally so no subprocess is ever created.

    Returns the AsyncMock so tests can configure return_value / side_effect.
    Default return is ("", "", 0) -- success with empty output.
    """
    mock = AsyncMock(return_value=("", "", 0))
    with patch("services.cmd.run_cmd", mock):
        yield mock


# ---------------------------------------------------------------------------
# FastAPI TestClient with authentication bypassed
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_current_user():
    """Return a fake user dict used to override the auth dependency."""
    return {"username": "testadmin"}


@pytest.fixture
def client(mock_current_user):
    """Provide a synchronous httpx TestClient for the FastAPI app.

    - Authentication is bypassed (get_current_user returns a fixed user).
    - The db module's _db is patched so get_db() lazily creates an
      in-memory connection on the correct event loop.
    - Import happens inside the fixture so sys.path is already configured.
    """
    from fastapi.testclient import TestClient
    from middleware.auth import get_current_user
    from main import app

    async def _override_user():
        return mock_current_user

    app.dependency_overrides[get_current_user] = _override_user

    # Replace get_db with a version that creates an in-memory db on first
    # call within the TestClient's event loop.  We also set _db directly
    # so functions that read _db see the same connection.
    _test_conn = None
    original_get_db = db_module.get_db
    original_db = db_module._db

    async def _test_get_db():
        nonlocal _test_conn
        if _test_conn is None:
            _test_conn = await aiosqlite.connect(":memory:")
            _test_conn.row_factory = aiosqlite.Row
            await _test_conn.executescript(db_module.SCHEMA)
            await _test_conn.commit()
            db_module._db = _test_conn
        return _test_conn

    db_module.get_db = _test_get_db

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c

    # Restore
    db_module.get_db = original_get_db
    db_module._db = original_db
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    """Headers required for mutating requests (CSRF protection)."""
    return {"X-Requested-With": "XMLHttpRequest"}
