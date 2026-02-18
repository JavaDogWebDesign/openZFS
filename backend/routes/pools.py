"""Pool management API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
from models import (
    DeviceActionRequest,
    ImportRequest,
    PoolCreateRequest,
    PoolDestroyRequest,
    ReplaceRequest,
    ScrubRequest,
    ScrubScheduleCreate,
    ScrubScheduleUpdate,
    TrimRequest,
)
from services import zpool
from db import (
    audit_log,
    create_scrub_schedule,
    list_scrub_schedules as db_list_scrub_schedules,
    get_scrub_schedule,
    update_scrub_schedule,
    delete_scrub_schedule as db_delete_scrub_schedule,
)

router = APIRouter()


@router.get("")
async def list_pools(user: dict = Depends(get_current_user)):
    """List all ZFS pools."""
    return await zpool.list_pools()


# --- Scrub schedules (registered BEFORE /{pool} catch-all) ---


@router.get("/scrub-schedules")
async def list_scrub_schedules(user: dict = Depends(get_current_user)):
    """List all scrub schedules."""
    return await db_list_scrub_schedules()


@router.post("/scrub-schedules")
async def create_schedule(body: ScrubScheduleCreate, user: dict = Depends(get_current_user)):
    """Create a scrub schedule."""
    schedule_id = await create_scrub_schedule(
        pool=body.pool,
        frequency=body.frequency,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        hour=body.hour,
        minute=body.minute,
    )
    await audit_log(user["username"], "scrub.schedule.create", body.pool)
    return {"id": schedule_id, "message": f"Scrub schedule created for {body.pool}"}


@router.put("/scrub-schedules/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    body: ScrubScheduleUpdate,
    user: dict = Depends(get_current_user),
):
    """Update a scrub schedule."""
    existing = await get_scrub_schedule(schedule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    updates = body.model_dump(exclude_none=True)
    if "enabled" in updates:
        updates["enabled"] = int(updates["enabled"])
    await update_scrub_schedule(schedule_id, **updates)
    await audit_log(user["username"], "scrub.schedule.update", existing["pool"])
    return {"message": "Schedule updated"}


@router.delete("/scrub-schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, user: dict = Depends(get_current_user)):
    """Delete a scrub schedule."""
    existing = await get_scrub_schedule(schedule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db_delete_scrub_schedule(schedule_id)
    await audit_log(user["username"], "scrub.schedule.delete", existing["pool"])
    return {"message": "Schedule deleted"}


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
    """Destroy a pool. Requires confirmation.

    Sequence: kill processes → unmount → export (offline) → destroy.
    A pool must be fully offline (no open handles) before it can be destroyed.
    """
    import asyncio
    from services.cmd import run_cmd

    if body.confirm != pool:
        raise HTTPException(status_code=400, detail="Confirmation does not match pool name")

    logger.info("Starting pool destroy sequence for %s", pool)

    # 1. Close WebSocket connections for this pool
    from ws import stop_pool_streams
    await stop_pool_streams(pool)

    # 2. SIGKILL any zpool subprocesses referencing this pool
    logger.info("[destroy %s] Killing zpool subprocesses", pool)
    for pattern in [f"zpool iostat.*{pool}", f"zpool.*{pool}"]:
        try:
            proc = await asyncio.create_subprocess_exec(
                "pkill", "-9", "-f", pattern,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
        except Exception:
            pass
    await asyncio.sleep(1)

    # 3. Kill any processes using the pool's mountpoint
    try:
        mp_out, _, mp_rc = await run_cmd(["zfs", "get", "-H", "-o", "value", "mountpoint", pool])
        if mp_rc == 0 and mp_out.strip() and mp_out.strip() != "-":
            mountpoint = mp_out.strip()
            logger.info("[destroy %s] Killing processes on mountpoint %s", pool, mountpoint)
            proc = await asyncio.create_subprocess_exec(
                "fuser", "-km", mountpoint,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
    except Exception:
        pass

    # 4. Unshare and force-unmount all datasets under this pool
    logger.info("[destroy %s] Unmounting datasets", pool)
    for prop in ["sharenfs", "sharesmb"]:
        try:
            await run_cmd(["zfs", "set", f"{prop}=off", pool])
        except Exception:
            pass
    try:
        await run_cmd(["zfs", "unmount", "-f", pool])
    except Exception:
        pass

    # 5. Export the pool (take it offline — releases all kernel handles)
    logger.info("[destroy %s] Exporting pool (taking offline)", pool)
    try:
        await zpool.export_pool(pool, force=True)
    except Exception as e:
        logger.warning("[destroy %s] Export failed: %s", pool, e)

    await asyncio.sleep(1)

    # 6. Re-import if exported (can't destroy an exported pool directly)
    logger.info("[destroy %s] Re-importing for destroy", pool)
    try:
        await zpool.import_pool(pool)
    except Exception:
        pass  # May still be imported if export failed

    # 7. Destroy with retries — kill iostat RIGHT BEFORE each attempt
    #    because the WebSocket may reconnect and spawn a new process
    last_err = None
    for attempt in range(3):
        if attempt > 0:
            delay = attempt * 3
            logger.info("[destroy %s] Retry %d, waiting %ds...", pool, attempt + 1, delay)
            await asyncio.sleep(delay)

        # Kill iostat/events subprocesses immediately before destroy
        logger.info("[destroy %s] Killing zpool subprocesses (attempt %d)", pool, attempt + 1)
        try:
            p = await asyncio.create_subprocess_exec(
                "pkill", "-9", "-f", f"zpool iostat.*{pool}",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await p.wait()
        except Exception:
            pass
        # Brief pause for process to fully die
        await asyncio.sleep(0.5)

        try:
            await zpool.destroy_pool(pool, force=True)
            last_err = None
            logger.info("[destroy %s] Pool destroyed successfully", pool)
            break
        except Exception as e:
            last_err = e
            logger.warning("[destroy %s] Attempt %d failed: %s", pool, attempt + 1, e)

    if last_err is not None:
        logger.error("[destroy %s] All attempts failed", pool)
        raise last_err

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


@router.get("/{pool}/iostat-history")
async def get_iostat_history(pool: str, user: dict = Depends(get_current_user)):
    """Get buffered iostat history (up to 5 min) for pre-populating charts."""
    from ws import get_iostat_history
    return get_iostat_history(pool)


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
