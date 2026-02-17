"""Pool management API routes."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models import (
    DeviceActionRequest,
    ImportRequest,
    PoolCreateRequest,
    PoolDestroyRequest,
    ReplaceRequest,
    ScrubRequest,
    TrimRequest,
)
from services import zpool
from db import audit_log

router = APIRouter()


@router.get("")
async def list_pools(user: dict = Depends(get_current_user)):
    """List all ZFS pools."""
    return await zpool.list_pools()


@router.get("/{pool}")
async def get_pool(pool: str, user: dict = Depends(get_current_user)):
    """Get detailed pool status and properties."""
    status = await zpool.get_status(pool)
    properties = await zpool.get_pool_properties(pool)
    return {"status": status, "properties": properties}


@router.post("")
async def create_pool(body: PoolCreateRequest, user: dict = Depends(get_current_user)):
    """Create a new storage pool."""
    await zpool.create_pool(
        name=body.name,
        vdevs=body.vdevs,
        force=body.force,
        mountpoint=body.mountpoint,
        properties=body.properties,
        fs_properties=body.fs_properties,
    )
    await audit_log(user["username"], "pool.create", body.name)
    return {"message": f"Pool {body.name} created"}


@router.delete("/{pool}")
async def destroy_pool(pool: str, body: PoolDestroyRequest, user: dict = Depends(get_current_user)):
    """Destroy a pool. Requires confirmation."""
    if body.confirm != pool:
        return {"error": "Confirmation does not match pool name"}, 400
    await zpool.destroy_pool(pool, force=body.force)
    await audit_log(user["username"], "pool.destroy", pool)
    return {"message": f"Pool {pool} destroyed"}


@router.get("/{pool}/properties")
async def get_pool_properties(pool: str, user: dict = Depends(get_current_user)):
    """Get all pool properties."""
    return await zpool.get_pool_properties(pool)


@router.post("/{pool}/scrub")
async def scrub_pool(pool: str, body: ScrubRequest, user: dict = Depends(get_current_user)):
    """Start, pause, or stop a scrub."""
    await zpool.scrub(pool, action=body.action)
    await audit_log(user["username"], f"pool.scrub.{body.action}", pool)
    return {"message": f"Scrub {body.action} on {pool}"}


@router.post("/{pool}/trim")
async def trim_pool(pool: str, body: TrimRequest, user: dict = Depends(get_current_user)):
    """Start or stop TRIM."""
    await zpool.trim(pool, stop=body.stop)
    action = "stop" if body.stop else "start"
    await audit_log(user["username"], f"pool.trim.{action}", pool)
    return {"message": f"Trim {action} on {pool}"}


@router.get("/{pool}/iostat")
async def get_iostat(pool: str, user: dict = Depends(get_current_user)):
    """Get a single I/O stats sample."""
    return await zpool.get_iostat(pool)


@router.get("/{pool}/history")
async def get_history(pool: str, user: dict = Depends(get_current_user)):
    """Get pool command history."""
    lines = await zpool.history(pool)
    return {"history": lines}


@router.post("/{pool}/import")
async def import_pool(pool: str, body: ImportRequest, user: dict = Depends(get_current_user)):
    """Import a pool."""
    await zpool.import_pool(pool, force=body.force)
    await audit_log(user["username"], "pool.import", pool)
    return {"message": f"Pool {pool} imported"}


@router.post("/{pool}/export")
async def export_pool(pool: str, user: dict = Depends(get_current_user)):
    """Export a pool."""
    await zpool.export_pool(pool)
    await audit_log(user["username"], "pool.export", pool)
    return {"message": f"Pool {pool} exported"}


# --- Device management ---


@router.get("/{pool}/devices")
async def get_devices(pool: str, user: dict = Depends(get_current_user)):
    """Get the device tree from pool status."""
    status = await zpool.get_status(pool)
    return {"devices": status.get("config", [])}


@router.post("/{pool}/devices")
async def add_device(pool: str, body: DeviceActionRequest, user: dict = Depends(get_current_user)):
    """Add a vdev to a pool."""
    await zpool.add_vdev(pool, [body.device])
    await audit_log(user["username"], "pool.device.add", f"{pool}/{body.device}")
    return {"message": f"Device {body.device} added to {pool}"}


@router.delete("/{pool}/devices/{device:path}")
async def remove_device(pool: str, device: str, user: dict = Depends(get_current_user)):
    """Remove a device from a pool."""
    await zpool.remove_vdev(pool, device)
    await audit_log(user["username"], "pool.device.remove", f"{pool}/{device}")
    return {"message": f"Device {device} removed from {pool}"}


@router.post("/{pool}/devices/replace")
async def replace_device(pool: str, body: ReplaceRequest, user: dict = Depends(get_current_user)):
    """Replace a device in a pool."""
    await zpool.replace(pool, body.old_device, body.new_device)
    await audit_log(user["username"], "pool.device.replace", f"{pool}/{body.old_device}")
    return {"message": f"Device {body.old_device} replaced in {pool}"}


@router.post("/{pool}/devices/{device:path}/online")
async def online_device(pool: str, device: str, user: dict = Depends(get_current_user)):
    """Bring a device online."""
    await zpool.online(pool, device)
    return {"message": f"Device {device} online"}


@router.post("/{pool}/devices/{device:path}/offline")
async def offline_device(pool: str, device: str, user: dict = Depends(get_current_user)):
    """Take a device offline."""
    await zpool.offline(pool, device)
    return {"message": f"Device {device} offline"}


@router.post("/{pool}/clear")
async def clear_errors(pool: str, user: dict = Depends(get_current_user)):
    """Clear pool errors."""
    await zpool.clear(pool)
    return {"message": f"Errors cleared on {pool}"}


@router.post("/{pool}/checkpoint")
async def create_checkpoint(pool: str, user: dict = Depends(get_current_user)):
    """Create a pool checkpoint."""
    await zpool.checkpoint(pool)
    await audit_log(user["username"], "pool.checkpoint", pool)
    return {"message": f"Checkpoint created for {pool}"}


@router.delete("/{pool}/checkpoint")
async def discard_checkpoint(pool: str, user: dict = Depends(get_current_user)):
    """Discard a pool checkpoint."""
    await zpool.checkpoint(pool, discard=True)
    await audit_log(user["username"], "pool.checkpoint.discard", pool)
    return {"message": f"Checkpoint discarded for {pool}"}
