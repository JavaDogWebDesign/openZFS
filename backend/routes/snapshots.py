"""Snapshot management API routes."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models import (
    BookmarkRequest,
    CloneRequest,
    HoldRequest,
    RollbackRequest,
    SnapshotCreateRequest,
    SnapshotDestroyRequest,
)
from services import zfs
from db import audit_log

router = APIRouter()


@router.get("/{dataset:path}/snapshots")
async def list_snapshots(dataset: str, user: dict = Depends(get_current_user)):
    """List snapshots for a dataset."""
    return await zfs.list_snapshots(dataset)


@router.post("/{dataset:path}/snapshots")
async def create_snapshot(dataset: str, body: SnapshotCreateRequest, user: dict = Depends(get_current_user)):
    """Create a snapshot."""
    await zfs.create_snapshot(dataset, body.name, recursive=body.recursive)
    await audit_log(user["username"], "snapshot.create", f"{dataset}@{body.name}")
    return {"message": f"Snapshot {dataset}@{body.name} created"}


@router.delete("/{snapshot:path}")
async def destroy_snapshot(snapshot: str, body: SnapshotDestroyRequest, user: dict = Depends(get_current_user)):
    """Destroy a snapshot. Requires confirmation."""
    if body.confirm != snapshot:
        return {"error": "Confirmation does not match snapshot name"}, 400
    await zfs.destroy(snapshot, recursive=body.recursive)
    await audit_log(user["username"], "snapshot.destroy", snapshot)
    return {"message": f"Snapshot {snapshot} destroyed"}


@router.post("/{snapshot:path}/rollback")
async def rollback_snapshot(snapshot: str, body: RollbackRequest, user: dict = Depends(get_current_user)):
    """Rollback a dataset to a snapshot. DESTRUCTIVE."""
    if body.confirm != snapshot:
        return {"error": "Confirmation does not match snapshot name"}, 400
    await zfs.rollback(snapshot, destroy_newer=body.destroy_newer, force=body.force)
    await audit_log(user["username"], "snapshot.rollback", snapshot)
    return {"message": f"Rolled back to {snapshot}"}


@router.post("/{snapshot:path}/clone")
async def clone_snapshot(snapshot: str, body: CloneRequest, user: dict = Depends(get_current_user)):
    """Create a writable clone from a snapshot."""
    await zfs.clone(snapshot, body.target, properties=body.properties)
    await audit_log(user["username"], "snapshot.clone", snapshot, detail=f"target={body.target}")
    return {"message": f"Clone {body.target} created from {snapshot}"}


@router.post("/{snapshot:path}/hold")
async def hold_snapshot(snapshot: str, body: HoldRequest, user: dict = Depends(get_current_user)):
    """Place a hold on a snapshot."""
    await zfs.hold(body.tag, snapshot)
    return {"message": f"Hold '{body.tag}' placed on {snapshot}"}


@router.delete("/{snapshot:path}/hold/{tag}")
async def release_hold(snapshot: str, tag: str, user: dict = Depends(get_current_user)):
    """Release a hold on a snapshot."""
    await zfs.release(tag, snapshot)
    return {"message": f"Hold '{tag}' released from {snapshot}"}


@router.get("/{snapshot:path}/holds")
async def list_holds(snapshot: str, user: dict = Depends(get_current_user)):
    """List holds on a snapshot."""
    return await zfs.holds(snapshot)


@router.get("/{snap_a:path}/diff/{snap_b:path}")
async def diff_snapshots(snap_a: str, snap_b: str, user: dict = Depends(get_current_user)):
    """Show differences between two snapshots."""
    return await zfs.diff(snap_a, snap_b)


@router.post("/{snapshot:path}/bookmark")
async def create_bookmark(snapshot: str, body: BookmarkRequest, user: dict = Depends(get_current_user)):
    """Create a bookmark from a snapshot."""
    await zfs.bookmark(snapshot, body.name)
    dataset = snapshot.split("@")[0]
    await audit_log(user["username"], "snapshot.bookmark", f"{dataset}#{body.name}")
    return {"message": f"Bookmark {dataset}#{body.name} created"}


@router.get("/{dataset:path}/bookmarks")
async def list_bookmarks(dataset: str, user: dict = Depends(get_current_user)):
    """List bookmarks for a dataset."""
    return await zfs.list_bookmarks(dataset)
