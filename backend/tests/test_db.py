"""Tests for db.py — SQLite database operations.

Uses the in-memory test_db fixture from conftest.py.

Covers:
- Session CRUD: create, get, delete, expiry cleanup
- Audit log: write entries, retrieve with limit/offset
- Replication jobs: create, list, get, update, delete
"""

import time
from unittest.mock import patch

import pytest
import pytest_asyncio

import db as db_module


# ===================================================================
# Session management
# ===================================================================


class TestSessions:
    """Session create / get / delete / cleanup."""

    @pytest.mark.asyncio
    async def test_create_session_returns_hex_id(self, test_db):
        sid = await db_module.create_session("alice")
        assert isinstance(sid, str)
        assert len(sid) == 32  # uuid4().hex length

    @pytest.mark.asyncio
    async def test_get_session_returns_dict(self, test_db):
        sid = await db_module.create_session("alice")
        session = await db_module.get_session(sid)
        assert session is not None
        assert session["username"] == "alice"
        assert session["id"] == sid
        assert "created_at" in session
        assert "expires_at" in session

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, test_db):
        result = await db_module.get_session("nonexistent_session_id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_session_expired(self, test_db):
        """Expired sessions should return None and be deleted."""
        sid = await db_module.create_session("alice")
        # Manually expire it
        await test_db.execute(
            "UPDATE sessions SET expires_at = ? WHERE id = ?",
            (time.time() - 100, sid),
        )
        await test_db.commit()

        result = await db_module.get_session(sid)
        assert result is None

        # Verify it was deleted from the database
        cursor = await test_db.execute("SELECT id FROM sessions WHERE id = ?", (sid,))
        assert await cursor.fetchone() is None

    @pytest.mark.asyncio
    async def test_delete_session(self, test_db):
        sid = await db_module.create_session("alice")
        await db_module.delete_session(sid)
        result = await db_module.get_session(sid)
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_session(self, test_db):
        """Deleting a non-existent session should not raise."""
        await db_module.delete_session("does_not_exist")

    @pytest.mark.asyncio
    async def test_cleanup_sessions(self, test_db):
        """cleanup_sessions should remove only expired sessions."""
        sid1 = await db_module.create_session("alice")
        sid2 = await db_module.create_session("bob")

        # Expire sid1
        await test_db.execute(
            "UPDATE sessions SET expires_at = ? WHERE id = ?",
            (time.time() - 100, sid1),
        )
        await test_db.commit()

        deleted = await db_module.cleanup_sessions()
        assert deleted == 1

        # sid1 gone, sid2 still present
        assert await db_module.get_session(sid1) is None
        assert (await db_module.get_session(sid2)) is not None

    @pytest.mark.asyncio
    async def test_session_lifetime(self, test_db):
        """New sessions should expire after SESSION_LIFETIME seconds."""
        before = time.time()
        sid = await db_module.create_session("alice")
        session = await db_module.get_session(sid)
        expected_expires = before + db_module.SESSION_LIFETIME
        # Allow 2 second tolerance
        assert abs(session["expires_at"] - expected_expires) < 2

    @pytest.mark.asyncio
    async def test_multiple_sessions_same_user(self, test_db):
        """A user can have multiple concurrent sessions."""
        sid1 = await db_module.create_session("alice")
        sid2 = await db_module.create_session("alice")
        assert sid1 != sid2
        assert (await db_module.get_session(sid1)) is not None
        assert (await db_module.get_session(sid2)) is not None


# ===================================================================
# Audit log
# ===================================================================


class TestAuditLog:
    """Audit log write / read."""

    @pytest.mark.asyncio
    async def test_write_and_read(self, test_db):
        await db_module.audit_log("alice", "pool.create", "tank")
        entries = await db_module.get_audit_log()
        assert len(entries) == 1
        assert entries[0]["username"] == "alice"
        assert entries[0]["action"] == "pool.create"
        assert entries[0]["target"] == "tank"
        assert entries[0]["success"] == 1

    @pytest.mark.asyncio
    async def test_write_failure_entry(self, test_db):
        await db_module.audit_log(
            "alice", "pool.destroy", "tank", detail="permission denied", success=False
        )
        entries = await db_module.get_audit_log()
        assert entries[0]["success"] == 0
        assert entries[0]["detail"] == "permission denied"

    @pytest.mark.asyncio
    async def test_ordering_newest_first(self, test_db):
        await db_module.audit_log("alice", "action1", "target1")
        await db_module.audit_log("bob", "action2", "target2")
        entries = await db_module.get_audit_log()
        assert len(entries) == 2
        # Most recent first
        assert entries[0]["username"] == "bob"
        assert entries[1]["username"] == "alice"

    @pytest.mark.asyncio
    async def test_limit_and_offset(self, test_db):
        for i in range(10):
            await db_module.audit_log(f"user{i}", f"action{i}", f"target{i}")

        # Limit
        entries = await db_module.get_audit_log(limit=3)
        assert len(entries) == 3

        # Offset
        all_entries = await db_module.get_audit_log(limit=100)
        offset_entries = await db_module.get_audit_log(limit=3, offset=2)
        assert len(offset_entries) == 3
        assert offset_entries[0]["username"] == all_entries[2]["username"]

    @pytest.mark.asyncio
    async def test_empty_audit_log(self, test_db):
        entries = await db_module.get_audit_log()
        assert entries == []


# ===================================================================
# Replication jobs
# ===================================================================


class TestReplicationJobs:
    """CRUD for replication jobs."""

    @pytest.mark.asyncio
    async def test_create_job_returns_id(self, test_db):
        job_id = await db_module.create_replication_job(
            name="daily-backup",
            source="tank/data",
            destination="backup/data",
        )
        assert isinstance(job_id, str)
        assert len(job_id) == 32  # uuid4().hex

    @pytest.mark.asyncio
    async def test_get_job(self, test_db):
        job_id = await db_module.create_replication_job(
            name="daily-backup",
            source="tank/data",
            destination="backup/data",
            direction="ssh",
            ssh_host="remote.example.com",
            ssh_user="zfsadmin",
            recursive=True,
            raw_send=True,
            compressed=True,
            schedule="0 2 * * *",
        )
        job = await db_module.get_replication_job(job_id)
        assert job is not None
        assert job["name"] == "daily-backup"
        assert job["source"] == "tank/data"
        assert job["destination"] == "backup/data"
        assert job["direction"] == "ssh"
        assert job["ssh_host"] == "remote.example.com"
        assert job["ssh_user"] == "zfsadmin"
        assert job["recursive"] == 1  # stored as integer
        assert job["raw_send"] == 1
        assert job["compressed"] == 1
        assert job["schedule"] == "0 2 * * *"
        assert job["enabled"] == 1  # default

    @pytest.mark.asyncio
    async def test_get_nonexistent_job(self, test_db):
        result = await db_module.get_replication_job("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_jobs(self, test_db):
        await db_module.create_replication_job(
            name="job1", source="tank/a", destination="backup/a"
        )
        await db_module.create_replication_job(
            name="job2", source="tank/b", destination="backup/b"
        )
        jobs = await db_module.list_replication_jobs()
        assert len(jobs) == 2
        # Most recent first
        assert jobs[0]["name"] == "job2"

    @pytest.mark.asyncio
    async def test_update_job(self, test_db):
        job_id = await db_module.create_replication_job(
            name="old-name", source="tank/data", destination="backup/data"
        )
        await db_module.update_replication_job(job_id, name="new-name", enabled=0)
        job = await db_module.get_replication_job(job_id)
        assert job["name"] == "new-name"
        assert job["enabled"] == 0

    @pytest.mark.asyncio
    async def test_update_job_ignores_unknown_fields(self, test_db):
        """Fields not in the allowed set should be silently ignored."""
        job_id = await db_module.create_replication_job(
            name="test", source="tank/data", destination="backup/data"
        )
        await db_module.update_replication_job(job_id, name="updated", unknown_field="evil")
        job = await db_module.get_replication_job(job_id)
        assert job["name"] == "updated"

    @pytest.mark.asyncio
    async def test_update_job_with_no_valid_fields(self, test_db):
        """If no valid fields are provided, the update is a no-op."""
        job_id = await db_module.create_replication_job(
            name="test", source="tank/data", destination="backup/data"
        )
        await db_module.update_replication_job(job_id, bogus="value")
        job = await db_module.get_replication_job(job_id)
        assert job["name"] == "test"  # unchanged

    @pytest.mark.asyncio
    async def test_update_last_run_status(self, test_db):
        """update can set runtime status fields."""
        job_id = await db_module.create_replication_job(
            name="test", source="tank/data", destination="backup/data"
        )
        now = time.time()
        await db_module.update_replication_job(
            job_id, last_run=now, last_status="success", last_bytes=1048576
        )
        job = await db_module.get_replication_job(job_id)
        assert abs(job["last_run"] - now) < 1
        assert job["last_status"] == "success"
        assert job["last_bytes"] == 1048576

    @pytest.mark.asyncio
    async def test_delete_job(self, test_db):
        job_id = await db_module.create_replication_job(
            name="doomed", source="tank/data", destination="backup/data"
        )
        await db_module.delete_replication_job(job_id)
        assert await db_module.get_replication_job(job_id) is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_job(self, test_db):
        """Deleting a non-existent job should not raise."""
        await db_module.delete_replication_job("nonexistent")

    @pytest.mark.asyncio
    async def test_default_values(self, test_db):
        """Verify defaults for optional fields."""
        job_id = await db_module.create_replication_job(
            name="minimal", source="tank/a", destination="backup/a"
        )
        job = await db_module.get_replication_job(job_id)
        assert job["direction"] == "local"
        assert job["ssh_host"] == ""
        assert job["ssh_user"] == "root"
        assert job["recursive"] == 0
        assert job["raw_send"] == 0
        assert job["compressed"] == 0
        assert job["schedule"] == ""
        assert job["enabled"] == 1
        assert job["last_run"] is None
        assert job["last_status"] is None
        assert job["last_bytes"] is None
