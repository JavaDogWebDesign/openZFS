"""SQLite database — sessions, audit log, replication jobs.

Uses aiosqlite for async access. The database file lives at
backend/data/zfs-manager.db (created automatically).
"""

import os
import time
import uuid
import logging

import aiosqlite

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DB_DIR, "zfs-manager.db")

_db: aiosqlite.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    created_at  REAL NOT NULL,
    expires_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   REAL NOT NULL,
    username    TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT NOT NULL,
    detail      TEXT DEFAULT '',
    success     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS replication_jobs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL,
    destination TEXT NOT NULL,
    direction   TEXT NOT NULL DEFAULT 'local',
    ssh_host    TEXT DEFAULT '',
    ssh_user    TEXT DEFAULT 'root',
    recursive   INTEGER NOT NULL DEFAULT 0,
    raw_send    INTEGER NOT NULL DEFAULT 0,
    compressed  INTEGER NOT NULL DEFAULT 0,
    schedule    TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_run    REAL DEFAULT NULL,
    last_status TEXT DEFAULT NULL,
    last_bytes  INTEGER DEFAULT NULL,
    created_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS scrub_schedules (
    id          TEXT PRIMARY KEY,
    pool        TEXT NOT NULL,
    frequency   TEXT NOT NULL DEFAULT 'weekly',
    day_of_week INTEGER NOT NULL DEFAULT 0,
    day_of_month INTEGER NOT NULL DEFAULT 1,
    hour        INTEGER NOT NULL DEFAULT 2,
    minute      INTEGER NOT NULL DEFAULT 0,
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_run    REAL DEFAULT NULL,
    last_status TEXT DEFAULT NULL,
    created_at  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_replication_enabled ON replication_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_scrub_enabled ON scrub_schedules(enabled);
"""


async def get_db() -> aiosqlite.Connection:
    """Get the database connection, creating it if needed."""
    global _db
    if _db is None:
        os.makedirs(DB_DIR, exist_ok=True)
        _db = await aiosqlite.connect(DB_PATH)
        _db.row_factory = aiosqlite.Row
        await _db.executescript(SCHEMA)
        await _db.commit()
        logger.info("Database initialized at %s", DB_PATH)
    return _db


async def close_db() -> None:
    """Close the database connection."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None


# --- Session helpers ---

SESSION_LIFETIME = 86400  # 24 hours


async def create_session(username: str) -> str:
    """Create a new session, return the session ID."""
    db = await get_db()
    session_id = uuid.uuid4().hex
    now = time.time()
    await db.execute(
        "INSERT INTO sessions (id, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session_id, username, now, now + SESSION_LIFETIME),
    )
    await db.commit()
    return session_id


async def get_session(session_id: str) -> dict | None:
    """Look up a session by ID. Returns None if expired or not found."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, username, created_at, expires_at FROM sessions WHERE id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    if row["expires_at"] < time.time():
        await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await db.commit()
        return None
    return dict(row)


async def delete_session(session_id: str) -> None:
    """Delete a session (logout)."""
    db = await get_db()
    await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    await db.commit()


async def cleanup_sessions() -> int:
    """Delete all expired sessions. Returns count deleted."""
    db = await get_db()
    cursor = await db.execute(
        "DELETE FROM sessions WHERE expires_at < ?", (time.time(),)
    )
    await db.commit()
    return cursor.rowcount


# --- Audit log helpers ---


async def audit_log(
    username: str, action: str, target: str, detail: str = "", success: bool = True
) -> None:
    """Write an entry to the audit log."""
    db = await get_db()
    await db.execute(
        "INSERT INTO audit_log (timestamp, username, action, target, detail, success) VALUES (?, ?, ?, ?, ?, ?)",
        (time.time(), username, action, target, detail, int(success)),
    )
    await db.commit()


async def get_audit_log(limit: int = 100, offset: int = 0) -> list[dict]:
    """Retrieve recent audit log entries."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# --- Replication job helpers ---


async def create_replication_job(
    name: str,
    source: str,
    destination: str,
    direction: str = "local",
    ssh_host: str = "",
    ssh_user: str = "root",
    recursive: bool = False,
    raw_send: bool = False,
    compressed: bool = False,
    schedule: str = "",
) -> str:
    """Create a replication job, return its ID."""
    db = await get_db()
    job_id = uuid.uuid4().hex
    await db.execute(
        """INSERT INTO replication_jobs
           (id, name, source, destination, direction, ssh_host, ssh_user,
            recursive, raw_send, compressed, schedule, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            job_id, name, source, destination, direction, ssh_host, ssh_user,
            int(recursive), int(raw_send), int(compressed), schedule, time.time(),
        ),
    )
    await db.commit()
    return job_id


async def list_replication_jobs() -> list[dict]:
    """List all replication jobs."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM replication_jobs ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_replication_job(job_id: str) -> dict | None:
    """Get a single replication job."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM replication_jobs WHERE id = ?", (job_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def update_replication_job(job_id: str, **fields: object) -> None:
    """Update fields on a replication job."""
    db = await get_db()
    allowed = {
        "name", "source", "destination", "direction", "ssh_host", "ssh_user",
        "recursive", "raw_send", "compressed", "schedule", "enabled",
        "last_run", "last_status", "last_bytes",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [job_id]
    await db.execute(f"UPDATE replication_jobs SET {set_clause} WHERE id = ?", values)
    await db.commit()


async def delete_replication_job(job_id: str) -> None:
    """Delete a replication job."""
    db = await get_db()
    await db.execute("DELETE FROM replication_jobs WHERE id = ?", (job_id,))
    await db.commit()


# --- Scrub schedule helpers ---


async def create_scrub_schedule(
    pool: str,
    frequency: str = "weekly",
    day_of_week: int = 0,
    day_of_month: int = 1,
    hour: int = 2,
    minute: int = 0,
) -> str:
    """Create a scrub schedule, return its ID."""
    db = await get_db()
    schedule_id = uuid.uuid4().hex
    await db.execute(
        """INSERT INTO scrub_schedules
           (id, pool, frequency, day_of_week, day_of_month, hour, minute, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (schedule_id, pool, frequency, day_of_week, day_of_month, hour, minute, time.time()),
    )
    await db.commit()
    return schedule_id


async def list_scrub_schedules() -> list[dict]:
    """List all scrub schedules."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM scrub_schedules ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_scrub_schedule(schedule_id: str) -> dict | None:
    """Get a single scrub schedule."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM scrub_schedules WHERE id = ?", (schedule_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def update_scrub_schedule(schedule_id: str, **fields: object) -> None:
    """Update fields on a scrub schedule."""
    db = await get_db()
    allowed = {
        "pool", "frequency", "day_of_week", "day_of_month",
        "hour", "minute", "enabled", "last_run", "last_status",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [schedule_id]
    await db.execute(f"UPDATE scrub_schedules SET {set_clause} WHERE id = ?", values)
    await db.commit()


async def delete_scrub_schedule(schedule_id: str) -> None:
    """Delete a scrub schedule."""
    db = await get_db()
    await db.execute("DELETE FROM scrub_schedules WHERE id = ?", (schedule_id,))
    await db.commit()
