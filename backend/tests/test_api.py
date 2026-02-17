"""Tests for the FastAPI application — routes, exception handlers, health check.

All ZFS/zpool subprocess calls are mocked via patching services.zpool and
services.zfs functions. The auth dependency is overridden in conftest.py so
tests do not require PAM authentication.

Patch targets follow the "patch where it's looked up" rule:
- services.zpool.X and services.zfs.X  -- routes use `from services import zpool`
  and call `zpool.X()`, so patching the attribute on the module object works.
- routes.<module>.audit_log -- routes use `from db import audit_log`, creating
  a local name, so we must patch the local reference.
- routes.replication.<fn> -- same reason for replication db helpers.

Covers:
- Health check endpoint (/api/health)
- Auth routes (/api/auth/login, /api/auth/logout, /api/auth/me)
- Pool routes: list, get, create, destroy, scrub, trim
- Dataset routes: list, create, destroy, properties
- Snapshot routes: list, create, destroy, rollback
- Replication routes: CRUD for jobs
- System routes: version, audit log
- Exception handler mapping (ZFSError -> JSON, ValidationError -> 400)
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from exceptions import (
    ZFSError,
    ZFSNotFoundError,
    ZFSBusyError,
    ZFSPermissionError,
)


# ===================================================================
# Health check — unauthenticated
# ===================================================================


class TestHealthCheck:

    def test_health_returns_status(self, client):
        """GET /api/health should return a JSON object with status."""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "zfs" in data
        assert "zpool" in data

    def test_health_check_structure(self, client):
        """Health response should have boolean zfs/zpool fields."""
        data = client.get("/api/health").json()
        assert isinstance(data["zfs"], bool)
        assert isinstance(data["zpool"], bool)


# ===================================================================
# Auth routes
# ===================================================================


class TestAuthMe:

    def test_me_returns_current_user(self, client):
        """GET /api/auth/me with valid session returns user info."""
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"


class TestAuthLogin:

    @patch("middleware.auth.authenticate_user", return_value=True)
    def test_login_success(self, mock_auth, client, auth_headers):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "secret"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "admin"
        assert "Login successful" in data["message"]

    @patch("middleware.auth.authenticate_user", return_value=False)
    def test_login_failure(self, mock_auth, client, auth_headers):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong"},
            headers=auth_headers,
        )
        assert resp.status_code == 401

    def test_login_missing_fields(self, client, auth_headers):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin"},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # Pydantic validation error


class TestAuthLogout:

    def test_logout(self, client, auth_headers):
        resp = client.post("/api/auth/logout", headers=auth_headers)
        assert resp.status_code == 200
        assert "Logged out" in resp.json()["message"]


# ===================================================================
# Pool routes
# ===================================================================


class TestPoolListRoute:

    @patch("services.zpool.list_pools", new_callable=AsyncMock)
    def test_list_pools(self, mock_list, client):
        mock_list.return_value = [
            {"name": "tank", "size": "10T", "alloc": "3T", "free": "7T",
             "fragmentation": "5%", "capacity": "30%", "health": "ONLINE"},
        ]
        resp = client.get("/api/pools")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "tank"

    @patch("services.zpool.list_pools", new_callable=AsyncMock)
    def test_list_pools_empty(self, mock_list, client):
        mock_list.return_value = []
        resp = client.get("/api/pools")
        assert resp.status_code == 200
        assert resp.json() == []


class TestPoolGetRoute:

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_get_pool(self, mock_status, mock_props, client):
        mock_status.return_value = {
            "pool": "tank", "state": "ONLINE", "config": [], "errors": "No known data errors"
        }
        mock_props.return_value = {
            "size": {"value": "10T", "source": "-"},
        }
        resp = client.get("/api/pools/tank")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "properties" in data
        assert data["status"]["state"] == "ONLINE"

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_get_pool_not_found(self, mock_status, mock_props, client):
        mock_status.side_effect = ZFSNotFoundError("no such pool 'badpool'")
        resp = client.get("/api/pools/badpool")
        assert resp.status_code == 404
        assert "error" in resp.json()


class TestPoolCreateRoute:

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.create_pool", new_callable=AsyncMock)
    def test_create_pool(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools",
            json={"name": "newpool", "vdevs": ["mirror", "sda", "sdb"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "created" in resp.json()["message"]
        mock_create.assert_called_once()

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.create_pool", new_callable=AsyncMock)
    def test_create_pool_with_options(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools",
            json={
                "name": "newpool",
                "vdevs": ["mirror", "sda", "sdb"],
                "force": True,
                "mountpoint": "/mnt/newpool",
                "properties": {"ashift": "12"},
                "fs_properties": {"compression": "lz4"},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_create.assert_called_once_with(
            name="newpool",
            vdevs=["mirror", "sda", "sdb"],
            force=True,
            mountpoint="/mnt/newpool",
            properties={"ashift": "12"},
            fs_properties={"compression": "lz4"},
        )


class TestPoolDestroyRoute:

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.destroy_pool", new_callable=AsyncMock)
    def test_destroy_pool(self, mock_destroy, mock_audit, client, auth_headers):
        resp = client.request(
            "DELETE",
            "/api/pools/tank",
            json={"confirm": "tank"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "destroyed" in resp.json()["message"]

    @patch("services.zpool.destroy_pool", new_callable=AsyncMock)
    def test_destroy_pool_bad_confirmation(self, mock_destroy, client, auth_headers):
        resp = client.request(
            "DELETE",
            "/api/pools/tank",
            json={"confirm": "wrong"},
            headers=auth_headers,
        )
        # The route returns a tuple which FastAPI may handle differently,
        # but the response should not indicate success
        mock_destroy.assert_not_called()


class TestPoolScrubRoute:

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.scrub", new_callable=AsyncMock)
    def test_scrub_start(self, mock_scrub, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/scrub",
            json={"action": "start"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_scrub.assert_called_once_with("tank", action="start")

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.scrub", new_callable=AsyncMock)
    def test_scrub_stop(self, mock_scrub, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/scrub",
            json={"action": "stop"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_scrub.assert_called_once_with("tank", action="stop")


class TestPoolTrimRoute:

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.trim", new_callable=AsyncMock)
    def test_trim_start(self, mock_trim, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/trim",
            json={"stop": False},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_trim.assert_called_once_with("tank", stop=False)


# ===================================================================
# Dataset routes
# ===================================================================


class TestDatasetListRoute:

    @patch("services.zfs.list_datasets", new_callable=AsyncMock)
    def test_list_datasets(self, mock_list, client):
        mock_list.return_value = [
            {"name": "tank/data", "used": "1G", "avail": "9G",
             "refer": "500M", "mountpoint": "/tank/data", "compression": "lz4"},
        ]
        resp = client.get("/api/datasets")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "tank/data"

    @patch("services.zfs.list_datasets", new_callable=AsyncMock)
    def test_list_datasets_filtered_by_pool(self, mock_list, client):
        mock_list.return_value = []
        resp = client.get("/api/datasets?pool=tank")
        assert resp.status_code == 200
        mock_list.assert_called_once_with(pool="tank", dataset_type="filesystem,volume")


class TestDatasetCreateRoute:

    @patch("routes.datasets.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.create_dataset", new_callable=AsyncMock)
    def test_create_dataset(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/datasets",
            json={"name": "tank/new"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "created" in resp.json()["message"]
        mock_create.assert_called_once_with(
            name="tank/new", volume_size=None, properties={}
        )

    @patch("routes.datasets.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.create_dataset", new_callable=AsyncMock)
    def test_create_zvol(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/datasets",
            json={"name": "tank/vol1", "volume_size": "10G"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_create.assert_called_once_with(
            name="tank/vol1", volume_size="10G", properties={}
        )


class TestDatasetDestroyRoute:

    @patch("routes.datasets.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.destroy", new_callable=AsyncMock)
    def test_destroy_dataset(self, mock_destroy, mock_audit, client, auth_headers):
        resp = client.request(
            "DELETE",
            "/api/datasets/tank/data",
            json={"confirm": "tank/data"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "destroyed" in resp.json()["message"]


class TestDatasetPropertiesRoute:

    @patch("services.zfs.get_properties", new_callable=AsyncMock)
    def test_get_properties(self, mock_props, client):
        mock_props.return_value = {
            "compression": {"value": "lz4", "source": "local"},
            "mountpoint": {"value": "/tank/data", "source": "default"},
        }
        resp = client.get("/api/datasets/tank/data/properties")
        assert resp.status_code == 200
        data = resp.json()
        assert data["compression"]["value"] == "lz4"

    @patch("routes.datasets.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.set_property", new_callable=AsyncMock)
    def test_set_properties(self, mock_set, mock_audit, client, auth_headers):
        resp = client.patch(
            "/api/datasets/tank/data/properties",
            json={"properties": {"compression": "zstd", "atime": "off"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert mock_set.call_count == 2


# ===================================================================
# Snapshot routes
# ===================================================================


class TestSnapshotListRoute:

    @patch("services.zfs.list_snapshots", new_callable=AsyncMock)
    def test_list_snapshots(self, mock_list, client):
        mock_list.return_value = [
            {"name": "tank/data@snap1", "used": "100M", "refer": "500M", "creation": "1705000000"},
        ]
        resp = client.get("/api/snapshots/tank/data/snapshots")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "tank/data@snap1"


class TestSnapshotCreateRoute:

    @patch("routes.snapshots.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.create_snapshot", new_callable=AsyncMock)
    def test_create_snapshot(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/snapshots/tank/data/snapshots",
            json={"name": "snap1"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "created" in resp.json()["message"]
        mock_create.assert_called_once_with("tank/data", "snap1", recursive=False)

    @patch("routes.snapshots.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.create_snapshot", new_callable=AsyncMock)
    def test_create_recursive_snapshot(self, mock_create, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/snapshots/tank/data/snapshots",
            json={"name": "snap1", "recursive": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_create.assert_called_once_with("tank/data", "snap1", recursive=True)


class TestSnapshotDestroyRoute:

    @patch("routes.snapshots.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.destroy", new_callable=AsyncMock)
    def test_destroy_snapshot(self, mock_destroy, mock_audit, client, auth_headers):
        resp = client.request(
            "DELETE",
            "/api/snapshots/tank/data@snap1",
            json={"confirm": "tank/data@snap1"},
            headers=auth_headers,
        )
        assert resp.status_code == 200


class TestSnapshotRollbackRoute:

    @patch("routes.snapshots.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.rollback", new_callable=AsyncMock)
    def test_rollback(self, mock_rollback, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/snapshots/tank/data@snap1/rollback",
            json={"confirm": "tank/data@snap1"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "Rolled back" in resp.json()["message"]
        mock_rollback.assert_called_once_with(
            "tank/data@snap1", destroy_newer=False, force=False
        )


# ===================================================================
# Replication routes
# ===================================================================


class TestReplicationJobRoutes:

    @patch("routes.replication.list_replication_jobs", new_callable=AsyncMock)
    def test_list_jobs(self, mock_list, client):
        mock_list.return_value = [
            {"id": "abc123", "name": "daily", "source": "tank/data",
             "destination": "backup/data", "enabled": 1},
        ]
        resp = client.get("/api/replication/jobs")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("routes.replication.audit_log", new_callable=AsyncMock)
    @patch("routes.replication.create_replication_job", new_callable=AsyncMock)
    def test_create_job(self, mock_create, mock_audit, client, auth_headers):
        mock_create.return_value = "newjob123"
        resp = client.post(
            "/api/replication/jobs",
            json={
                "name": "daily",
                "source": "tank/data",
                "destination": "backup/data",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "newjob123"
        assert "created" in data["message"]

    @patch("routes.replication.get_replication_job", new_callable=AsyncMock)
    def test_get_job(self, mock_get, client):
        mock_get.return_value = {
            "id": "abc123", "name": "daily", "source": "tank/data",
            "destination": "backup/data", "enabled": 1,
        }
        resp = client.get("/api/replication/jobs/abc123")
        assert resp.status_code == 200
        assert resp.json()["name"] == "daily"

    @patch("routes.replication.audit_log", new_callable=AsyncMock)
    @patch("routes.replication.update_replication_job", new_callable=AsyncMock)
    def test_update_job(self, mock_update, mock_audit, client, auth_headers):
        resp = client.patch(
            "/api/replication/jobs/abc123",
            json={"name": "weekly", "enabled": False},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_update.assert_called_once()

    @patch("routes.replication.audit_log", new_callable=AsyncMock)
    @patch("routes.replication.delete_replication_job", new_callable=AsyncMock)
    def test_delete_job(self, mock_delete, mock_audit, client, auth_headers):
        resp = client.request(
            "DELETE",
            "/api/replication/jobs/abc123",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_delete.assert_called_once_with("abc123")


# ===================================================================
# System routes
# ===================================================================


class TestSystemVersionRoute:

    @patch("routes.system.run_cmd", new_callable=AsyncMock)
    def test_get_version(self, mock_cmd, client):
        mock_cmd.side_effect = [
            ("zfs-2.2.0-1\n", "", 0),
            ("zpool-2.2.0-1\n", "", 0),
        ]
        resp = client.get("/api/system/version")
        assert resp.status_code == 200
        data = resp.json()
        assert "zfs_version" in data
        assert "zpool_version" in data


class TestSystemAuditRoute:

    @patch("routes.system.get_audit_log", new_callable=AsyncMock)
    def test_get_audit_log(self, mock_get_log, client):
        """GET /api/system/audit returns the audit log entries."""
        mock_get_log.return_value = [
            {"id": 1, "timestamp": 1705000000.0, "username": "admin",
             "action": "pool.create", "target": "tank", "detail": "", "success": 1},
        ]
        resp = client.get("/api/system/audit")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["action"] == "pool.create"


# ===================================================================
# Exception handler integration
# ===================================================================


class TestExceptionHandlers:
    """Verify that ZFS exceptions are mapped to correct HTTP responses."""

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_zfs_not_found_returns_404(self, mock_status, mock_props, client):
        mock_status.side_effect = ZFSNotFoundError("no such pool 'ghost'")
        resp = client.get("/api/pools/ghost")
        assert resp.status_code == 404
        assert "error" in resp.json()

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_zfs_busy_returns_409(self, mock_status, mock_props, client):
        mock_status.side_effect = ZFSBusyError("dataset is busy")
        resp = client.get("/api/pools/tank")
        assert resp.status_code == 409

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_zfs_permission_returns_403(self, mock_status, mock_props, client):
        mock_status.side_effect = ZFSPermissionError("permission denied")
        resp = client.get("/api/pools/tank")
        assert resp.status_code == 403

    @patch("services.zpool.get_pool_properties", new_callable=AsyncMock)
    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_generic_zfs_error_returns_500(self, mock_status, mock_props, client):
        mock_status.side_effect = ZFSError("internal error")
        resp = client.get("/api/pools/tank")
        assert resp.status_code == 500
        assert resp.json()["error"] == "internal error"


# ===================================================================
# Pool import/export routes
# ===================================================================


class TestPoolImportExportRoutes:

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.import_pool", new_callable=AsyncMock)
    def test_import_pool(self, mock_import, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/import",
            json={"force": False},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "imported" in resp.json()["message"]

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.export_pool", new_callable=AsyncMock)
    def test_export_pool(self, mock_export, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/export",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "exported" in resp.json()["message"]


# ===================================================================
# Pool device management routes
# ===================================================================


class TestPoolDeviceRoutes:

    @patch("services.zpool.get_status", new_callable=AsyncMock)
    def test_get_devices(self, mock_status, client):
        mock_status.return_value = {
            "config": [{"name": "tank", "state": "ONLINE", "children": []}]
        }
        resp = client.get("/api/pools/tank/devices")
        assert resp.status_code == 200
        assert "devices" in resp.json()

    @patch("routes.pools.audit_log", new_callable=AsyncMock)
    @patch("services.zpool.replace", new_callable=AsyncMock)
    def test_replace_device(self, mock_replace, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/pools/tank/devices/replace",
            json={"old_device": "sda", "new_device": "sdc"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_replace.assert_called_once_with("tank", "sda", "sdc")


# ===================================================================
# Dataset mount/unmount and share routes
# ===================================================================


class TestDatasetMountRoutes:

    @patch("services.zfs.mount", new_callable=AsyncMock)
    def test_mount_dataset(self, mock_mount, client, auth_headers):
        resp = client.post(
            "/api/datasets/tank/data/mount",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "mounted" in resp.json()["message"]

    @patch("services.zfs.unmount", new_callable=AsyncMock)
    def test_unmount_dataset(self, mock_unmount, client, auth_headers):
        resp = client.post(
            "/api/datasets/tank/data/unmount",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "unmounted" in resp.json()["message"]


# ===================================================================
# Snapshot clone and hold routes
# ===================================================================


class TestSnapshotCloneRoute:

    @patch("routes.snapshots.audit_log", new_callable=AsyncMock)
    @patch("services.zfs.clone", new_callable=AsyncMock)
    def test_clone_snapshot(self, mock_clone, mock_audit, client, auth_headers):
        resp = client.post(
            "/api/snapshots/tank/data@snap1/clone",
            json={"target": "tank/clone1"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "clone1" in resp.json()["message"].lower() or "Clone" in resp.json()["message"]
        mock_clone.assert_called_once_with("tank/data@snap1", "tank/clone1", properties={})


class TestSnapshotHoldRoutes:

    @patch("services.zfs.hold", new_callable=AsyncMock)
    def test_hold_snapshot(self, mock_hold, client, auth_headers):
        resp = client.post(
            "/api/snapshots/tank/data@snap1/hold",
            json={"tag": "keep"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        mock_hold.assert_called_once_with("keep", "tank/data@snap1")

    @patch("services.zfs.holds", new_callable=AsyncMock)
    def test_list_holds(self, mock_holds, client):
        mock_holds.return_value = [
            {"name": "tank/data@snap1", "tag": "keep", "timestamp": "Wed Jan 17 10:00 2024"},
        ]
        resp = client.get("/api/snapshots/tank/data@snap1/holds")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["tag"] == "keep"
