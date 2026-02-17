"""Tests for models.py — Pydantic model validation.

Covers:
- Required fields raise ValidationError when missing
- Default values are applied correctly
- Field constraints (pattern, description) are enforced
- Optional fields accept None
- dict fields default to empty dicts
"""

import pytest
from pydantic import ValidationError

from models import (
    LoginRequest,
    LoginResponse,
    UserInfo,
    ErrorResponse,
    PoolSummary,
    PoolCreateRequest,
    PoolDestroyRequest,
    ScrubRequest,
    TrimRequest,
    DeviceActionRequest,
    ReplaceRequest,
    ImportRequest,
    DatasetSummary,
    DatasetCreateRequest,
    DatasetDestroyRequest,
    PropertySetRequest,
    InheritRequest,
    ShareRequest,
    SnapshotSummary,
    SnapshotCreateRequest,
    SnapshotDestroyRequest,
    RollbackRequest,
    CloneRequest,
    HoldRequest,
    BookmarkRequest,
    DiffEntry,
    ReplicationJobCreate,
    ReplicationJobUpdate,
    ManualSendRequest,
    LoadKeyRequest,
    ChangeKeyRequest,
    PermissionSetRequest,
    SystemVersion,
    DiskInfo,
    ArcStats,
)


# ===================================================================
# Auth models
# ===================================================================


class TestLoginRequest:

    def test_valid(self):
        m = LoginRequest(username="admin", password="secret")
        assert m.username == "admin"
        assert m.password == "secret"

    def test_missing_username(self):
        with pytest.raises(ValidationError):
            LoginRequest(password="secret")

    def test_missing_password(self):
        with pytest.raises(ValidationError):
            LoginRequest(username="admin")


class TestLoginResponse:

    def test_default_message(self):
        m = LoginResponse(username="admin")
        assert m.message == "Login successful"

    def test_custom_message(self):
        m = LoginResponse(username="admin", message="Welcome back")
        assert m.message == "Welcome back"


# ===================================================================
# Pool models
# ===================================================================


class TestPoolCreateRequest:

    def test_minimal(self):
        m = PoolCreateRequest(name="tank", vdevs=["sda", "sdb"])
        assert m.name == "tank"
        assert m.vdevs == ["sda", "sdb"]
        assert m.force is False
        assert m.mountpoint is None
        assert m.properties == {}
        assert m.fs_properties == {}

    def test_full(self):
        m = PoolCreateRequest(
            name="tank",
            vdevs=["mirror", "sda", "sdb"],
            force=True,
            mountpoint="/mnt/tank",
            properties={"ashift": "12"},
            fs_properties={"compression": "lz4"},
        )
        assert m.force is True
        assert m.mountpoint == "/mnt/tank"
        assert m.properties == {"ashift": "12"}

    def test_missing_name(self):
        with pytest.raises(ValidationError):
            PoolCreateRequest(vdevs=["sda"])

    def test_missing_vdevs(self):
        with pytest.raises(ValidationError):
            PoolCreateRequest(name="tank")


class TestPoolDestroyRequest:

    def test_valid(self):
        m = PoolDestroyRequest(confirm="tank")
        assert m.confirm == "tank"
        assert m.force is False

    def test_missing_confirm(self):
        with pytest.raises(ValidationError):
            PoolDestroyRequest()


class TestScrubRequest:

    def test_default_action(self):
        m = ScrubRequest()
        assert m.action == "start"

    @pytest.mark.parametrize("action", ["start", "pause", "stop"])
    def test_valid_actions(self, action):
        m = ScrubRequest(action=action)
        assert m.action == action

    def test_invalid_action(self):
        with pytest.raises(ValidationError):
            ScrubRequest(action="restart")


class TestTrimRequest:

    def test_default(self):
        m = TrimRequest()
        assert m.stop is False


class TestReplaceRequest:

    def test_with_new_device(self):
        m = ReplaceRequest(old_device="sda", new_device="sdc")
        assert m.old_device == "sda"
        assert m.new_device == "sdc"

    def test_without_new_device(self):
        m = ReplaceRequest(old_device="sda")
        assert m.new_device is None


# ===================================================================
# Dataset models
# ===================================================================


class TestDatasetCreateRequest:

    def test_filesystem(self):
        m = DatasetCreateRequest(name="tank/data")
        assert m.name == "tank/data"
        assert m.volume_size is None
        assert m.properties == {}

    def test_zvol(self):
        m = DatasetCreateRequest(name="tank/vol1", volume_size="10G")
        assert m.volume_size == "10G"

    def test_with_properties(self):
        m = DatasetCreateRequest(
            name="tank/data",
            properties={"compression": "lz4", "atime": "off"},
        )
        assert m.properties["compression"] == "lz4"


class TestDatasetDestroyRequest:

    def test_valid(self):
        m = DatasetDestroyRequest(confirm="tank/data")
        assert m.recursive is False
        assert m.force is False

    def test_recursive_force(self):
        m = DatasetDestroyRequest(confirm="tank/data", recursive=True, force=True)
        assert m.recursive is True
        assert m.force is True


class TestPropertySetRequest:

    def test_valid(self):
        m = PropertySetRequest(properties={"compression": "zstd"})
        assert m.properties == {"compression": "zstd"}

    def test_missing_properties(self):
        with pytest.raises(ValidationError):
            PropertySetRequest()


class TestInheritRequest:

    def test_valid(self):
        m = InheritRequest(property="compression")
        assert m.recursive is False

    def test_recursive(self):
        m = InheritRequest(property="compression", recursive=True)
        assert m.recursive is True


class TestShareRequest:

    def test_defaults(self):
        m = ShareRequest()
        assert m.protocol == "nfs"
        assert m.options == ""

    @pytest.mark.parametrize("protocol", ["nfs", "smb"])
    def test_valid_protocols(self, protocol):
        m = ShareRequest(protocol=protocol)
        assert m.protocol == protocol

    def test_invalid_protocol(self):
        with pytest.raises(ValidationError):
            ShareRequest(protocol="iscsi")


# ===================================================================
# Snapshot models
# ===================================================================


class TestSnapshotCreateRequest:

    def test_valid(self):
        m = SnapshotCreateRequest(name="daily-2024-01-15")
        assert m.name == "daily-2024-01-15"
        assert m.recursive is False


class TestSnapshotDestroyRequest:

    def test_valid(self):
        m = SnapshotDestroyRequest(confirm="tank@snap1")
        assert m.recursive is False


class TestRollbackRequest:

    def test_valid(self):
        m = RollbackRequest(confirm="tank@snap1")
        assert m.destroy_newer is False
        assert m.force is False

    def test_destructive_options(self):
        m = RollbackRequest(confirm="tank@snap1", destroy_newer=True, force=True)
        assert m.destroy_newer is True


class TestCloneRequest:

    def test_valid(self):
        m = CloneRequest(target="tank/clone1")
        assert m.target == "tank/clone1"
        assert m.properties == {}

    def test_with_properties(self):
        m = CloneRequest(target="tank/clone1", properties={"mountpoint": "/mnt/clone"})
        assert m.properties["mountpoint"] == "/mnt/clone"


class TestHoldRequest:

    def test_valid(self):
        m = HoldRequest(tag="keep")
        assert m.tag == "keep"


class TestBookmarkRequest:

    def test_valid(self):
        m = BookmarkRequest(name="v1.0")
        assert m.name == "v1.0"


class TestDiffEntry:

    def test_modified(self):
        m = DiffEntry(change_type="M", path="/tank/data/file.txt")
        assert m.new_path is None

    def test_renamed(self):
        m = DiffEntry(change_type="R", path="/old", new_path="/new")
        assert m.new_path == "/new"


# ===================================================================
# Replication models
# ===================================================================


class TestReplicationJobCreate:

    def test_minimal(self):
        m = ReplicationJobCreate(name="daily", source="tank/data", destination="backup/data")
        assert m.direction == "local"
        assert m.ssh_host == ""
        assert m.ssh_user == "root"
        assert m.recursive is False
        assert m.raw_send is False
        assert m.compressed is False
        assert m.schedule == ""

    def test_ssh_direction(self):
        m = ReplicationJobCreate(
            name="remote",
            source="tank/data",
            destination="backup/data",
            direction="ssh",
            ssh_host="remote.example.com",
        )
        assert m.direction == "ssh"

    def test_invalid_direction(self):
        with pytest.raises(ValidationError):
            ReplicationJobCreate(
                name="bad", source="a", destination="b", direction="ftp"
            )


class TestReplicationJobUpdate:

    def test_all_none(self):
        m = ReplicationJobUpdate()
        assert m.name is None
        assert m.enabled is None

    def test_partial_update(self):
        m = ReplicationJobUpdate(name="new-name", enabled=False)
        assert m.name == "new-name"
        assert m.enabled is False

    def test_model_dump_exclude_none(self):
        m = ReplicationJobUpdate(name="new-name")
        d = m.model_dump(exclude_none=True)
        assert d == {"name": "new-name"}


class TestManualSendRequest:

    def test_minimal(self):
        m = ManualSendRequest(snapshot="tank@snap1", destination="backup/data")
        assert m.incremental_from is None
        assert m.direction == "local"
        assert m.raw is False

    def test_invalid_direction(self):
        with pytest.raises(ValidationError):
            ManualSendRequest(
                snapshot="tank@snap1", destination="backup/data", direction="bad"
            )


# ===================================================================
# Encryption models
# ===================================================================


class TestLoadKeyRequest:

    def test_passphrase(self):
        m = LoadKeyRequest(passphrase="secret123")
        assert m.key_file is None

    def test_key_file(self):
        m = LoadKeyRequest(key_file="/etc/zfs/keys/tank.key")
        assert m.passphrase is None

    def test_empty(self):
        m = LoadKeyRequest()
        assert m.passphrase is None
        assert m.key_file is None


class TestChangeKeyRequest:

    def test_new_passphrase(self):
        m = ChangeKeyRequest(new_passphrase="newpass")
        assert m.new_key_file is None


# ===================================================================
# Permission model
# ===================================================================


class TestPermissionSetRequest:

    def test_valid(self):
        m = PermissionSetRequest(entity="alice", permissions=["create", "destroy"])
        assert m.entity_type == "user"

    def test_group(self):
        m = PermissionSetRequest(
            entity="wheel", entity_type="group", permissions=["mount"]
        )
        assert m.entity_type == "group"

    def test_invalid_entity_type(self):
        with pytest.raises(ValidationError):
            PermissionSetRequest(
                entity="alice", entity_type="role", permissions=["create"]
            )


# ===================================================================
# System models
# ===================================================================


class TestPoolSummary:

    def test_valid(self):
        m = PoolSummary(
            name="tank",
            size="10T",
            alloc="3T",
            free="7T",
            fragmentation="5%",
            capacity="30%",
            health="ONLINE",
        )
        assert m.health == "ONLINE"


class TestDiskInfo:

    def test_minimal(self):
        m = DiskInfo(name="/dev/sda", size=1000000000, type="disk")
        assert m.fstype is None
        assert m.mountpoint is None
        assert m.model is None
        assert m.serial is None

    def test_full(self):
        m = DiskInfo(
            name="/dev/sda",
            size=1000000000,
            type="disk",
            fstype="zfs_member",
            mountpoint="/mnt",
            model="Samsung SSD",
            serial="S1234",
        )
        assert m.model == "Samsung SSD"


class TestArcStats:

    def test_minimal(self):
        m = ArcStats(
            size=8_000_000_000,
            max_size=16_000_000_000,
            hit_rate=95.5,
            miss_rate=4.5,
            mru_size=4_000_000_000,
            mfu_size=4_000_000_000,
        )
        assert m.l2_size is None
        assert m.l2_hit_rate is None

    def test_with_l2arc(self):
        m = ArcStats(
            size=8_000_000_000,
            max_size=16_000_000_000,
            hit_rate=95.5,
            miss_rate=4.5,
            mru_size=4_000_000_000,
            mfu_size=4_000_000_000,
            l2_size=32_000_000_000,
            l2_hit_rate=80.0,
        )
        assert m.l2_size == 32_000_000_000
