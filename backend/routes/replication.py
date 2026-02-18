"""Replication management API routes."""

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models import ManualSendRequest, ReplicationJobCreate, ReplicationJobUpdate
from db import (
    audit_log,
    create_replication_job,
    delete_replication_job,
    get_replication_job,
    list_replication_jobs,
    update_replication_job,
)

router = APIRouter()


@router.get("/jobs")
async def list_jobs(user: dict = Depends(get_current_user)):
    """List all replication jobs."""
    return await list_replication_jobs()


@router.post("/jobs")
async def create_job(body: ReplicationJobCreate, user: dict = Depends(get_current_user)):
    """Create a new replication job."""
    job_id = await create_replication_job(
        name=body.name,
        source=body.source,
        destination=body.destination,
        direction=body.direction,
        ssh_host=body.ssh_host,
        ssh_user=body.ssh_user,
        recursive=body.recursive,
        raw_send=body.raw_send,
        compressed=body.compressed,
        schedule=body.schedule,
    )
    await audit_log(user["username"], "replication.create", body.name)
    return {"id": job_id, "message": f"Replication job '{body.name}' created"}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    """Get a single replication job."""
    job = await get_replication_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/jobs/{job_id}")
async def update_job(job_id: str, body: ReplicationJobUpdate, user: dict = Depends(get_current_user)):
    """Update a replication job."""
    job = await get_replication_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    updates = body.model_dump(exclude_none=True)
    await update_replication_job(job_id, **updates)
    await audit_log(user["username"], "replication.update", job_id)
    return {"message": "Job updated"}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    """Delete a replication job."""
    job = await get_replication_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    await delete_replication_job(job_id)
    await audit_log(user["username"], "replication.delete", job_id)
    return {"message": "Job deleted"}


@router.post("/send")
async def manual_send(body: ManualSendRequest, user: dict = Depends(get_current_user)):
    """Trigger a manual send/receive operation.

    This starts a background task and returns immediately.
    Progress is tracked via the /api/ws/send-progress WebSocket.
    """
    # For now, return the parameters — the actual send is handled
    # by the WebSocket endpoint in ws.py which manages the subprocess
    from services import zfs
    estimated = await zfs.send_size_estimate(body.snapshot, body.incremental_from)
    await audit_log(
        user["username"],
        "replication.send",
        body.snapshot,
        detail=f"dest={body.destination}, est={estimated}",
    )
    return {
        "message": "Send initiated",
        "snapshot": body.snapshot,
        "destination": body.destination,
        "estimated_bytes": estimated,
        "track_via": "/api/ws/send-progress",
    }
