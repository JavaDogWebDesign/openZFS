"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field


# --- Auth ---


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    username: str
    message: str = "Login successful"


class UserInfo(BaseModel):
    username: str


# --- Error ---


class ErrorResponse(BaseModel):
    error: str


# --- Pools ---


class PoolSummary(BaseModel):
    name: str
    size: str
    alloc: str
    free: str
    fragmentation: str
    capacity: str
    health: str


class PoolDetail(BaseModel):
    name: str
    properties: dict[str, dict[str, str]]
    status_raw: str


class PoolCreateRequest(BaseModel):
    name: str
    vdevs: list[str] = Field(..., description="Flat vdev spec: e.g. ['mirror', 'sda', 'sdb']")
    force: bool = False
    mountpoint: str | None = None
    properties: dict[str, str] = Field(default_factory=dict, description="Pool properties (-o)")
    fs_properties: dict[str, str] = Field(default_factory=dict, description="Root dataset properties (-O)")


class PoolDestroyRequest(BaseModel):
    confirm: str = Field(..., description="Must match pool name to confirm destruction")
    force: bool = False


class ScrubRequest(BaseModel):
    action: str = Field("start", pattern="^(start|pause|stop)$")


class TrimRequest(BaseModel):
    stop: bool = False


class DeviceActionRequest(BaseModel):
    device: str


class ReplaceRequest(BaseModel):
    old_device: str
    new_device: str | None = None


class ImportRequest(BaseModel):
    force: bool = False


# --- Datasets ---


class DatasetSummary(BaseModel):
    name: str
    used: str
    avail: str
    refer: str
    mountpoint: str
    compression: str


class DatasetCreateRequest(BaseModel):
    name: str
    volume_size: str | None = Field(None, description="If set, creates a zvol instead of filesystem")
    properties: dict[str, str] = Field(default_factory=dict)


class DatasetDestroyRequest(BaseModel):
    confirm: str
    recursive: bool = False
    force: bool = False


class PropertySetRequest(BaseModel):
    properties: dict[str, str]


class InheritRequest(BaseModel):
    property: str
    recursive: bool = False


class ShareRequest(BaseModel):
    protocol: str = Field("nfs", pattern="^(nfs|smb)$")
    options: str = ""


# --- Snapshots ---


class SnapshotSummary(BaseModel):
    name: str
    used: str
    refer: str
    creation: str


class SnapshotCreateRequest(BaseModel):
    name: str
    recursive: bool = False


class SnapshotDestroyRequest(BaseModel):
    confirm: str
    recursive: bool = False


class RollbackRequest(BaseModel):
    confirm: str
    destroy_newer: bool = False
    force: bool = False


class CloneRequest(BaseModel):
    target: str = Field(..., description="Full name of the new clone dataset")
    properties: dict[str, str] = Field(default_factory=dict)


class HoldRequest(BaseModel):
    tag: str


class BookmarkRequest(BaseModel):
    name: str = Field(..., description="Bookmark name (without dataset# prefix)")


class DiffEntry(BaseModel):
    change_type: str = Field(..., description="M (modified), + (added), - (removed), R (renamed)")
    path: str
    new_path: str | None = None


# --- Replication ---


class ReplicationJobCreate(BaseModel):
    name: str
    source: str
    destination: str
    direction: str = Field("local", pattern="^(local|ssh)$")
    ssh_host: str = ""
    ssh_user: str = "root"
    recursive: bool = False
    raw_send: bool = False
    compressed: bool = False
    schedule: str = Field("", description="Cron expression or empty for manual-only")


class ReplicationJobUpdate(BaseModel):
    name: str | None = None
    source: str | None = None
    destination: str | None = None
    schedule: str | None = None
    enabled: bool | None = None
    ssh_host: str | None = None
    ssh_user: str | None = None
    recursive: bool | None = None
    raw_send: bool | None = None
    compressed: bool | None = None


class ManualSendRequest(BaseModel):
    snapshot: str
    destination: str
    incremental_from: str | None = None
    direction: str = Field("local", pattern="^(local|ssh)$")
    ssh_host: str = ""
    ssh_user: str = "root"
    raw: bool = False
    compressed: bool = False


# --- Encryption ---


class LoadKeyRequest(BaseModel):
    passphrase: str | None = None
    key_file: str | None = None


class ChangeKeyRequest(BaseModel):
    new_passphrase: str | None = None
    new_key_file: str | None = None


# --- Permissions / Delegation ---


class PermissionSetRequest(BaseModel):
    entity: str = Field(..., description="Username or group name")
    entity_type: str = Field("user", pattern="^(user|group)$")
    permissions: list[str]


# --- System ---


class SystemVersion(BaseModel):
    zfs_version: str
    zpool_version: str


class DiskInfo(BaseModel):
    name: str
    size: int
    type: str
    fstype: str | None = None
    mountpoint: str | None = None
    model: str | None = None
    serial: str | None = None


class ArcStats(BaseModel):
    size: int
    max_size: int
    hit_rate: float
    miss_rate: float
    mru_size: int
    mfu_size: int
    l2_size: int | None = None
    l2_hit_rate: float | None = None


# --- Scrub Scheduling ---


class ScrubScheduleCreate(BaseModel):
    pool: str
    frequency: str = Field("weekly", pattern="^(daily|weekly|monthly)$")
    day_of_week: int = Field(0, ge=0, le=6, description="0=Mon, 6=Sun")
    day_of_month: int = Field(1, ge=1, le=28)
    hour: int = Field(2, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)


class ScrubScheduleUpdate(BaseModel):
    frequency: str | None = Field(None, pattern="^(daily|weekly|monthly)$")
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=28)
    hour: int | None = Field(None, ge=0, le=23)
    minute: int | None = Field(None, ge=0, le=59)
    enabled: bool | None = None
