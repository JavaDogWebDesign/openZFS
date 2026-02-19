"""User and group management API routes."""

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models import (
    SystemUserCreate,
    SystemUserDelete,
    SystemPasswordChange,
    GroupCreate,
    GroupDelete,
)
from services import users
from db import audit_log

router = APIRouter()


# --- Groups (must be defined before /{username} to avoid matching "groups" as username) ---


@router.get("/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    """List system groups."""
    try:
        return await users.list_groups()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/groups")
async def create_group(body: GroupCreate, user: dict = Depends(get_current_user)):
    """Create a new system group."""
    try:
        await users.create_group(body.name)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "group.create", body.name)
    return {"message": f"Group '{body.name}' created"}


@router.delete("/groups/{name}")
async def delete_group(name: str, body: GroupDelete, user: dict = Depends(get_current_user)):
    """Delete a system group. Requires confirmation."""
    if body.confirm != name:
        raise HTTPException(status_code=400, detail="Confirmation does not match group name")
    try:
        await users.delete_group(name)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "group.delete", name)
    return {"message": f"Group '{name}' deleted"}


# --- Users ---


@router.get("")
async def list_system_users(user: dict = Depends(get_current_user)):
    """List system users (UID >= 1000)."""
    try:
        return await users.list_system_users()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("")
async def create_system_user(body: SystemUserCreate, user: dict = Depends(get_current_user)):
    """Create a new system user."""
    try:
        await users.create_system_user(body.username, body.password, body.full_name)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.create", body.username)
    return {"message": f"User '{body.username}' created"}


@router.delete("/{username}")
async def delete_system_user(
    username: str,
    body: SystemUserDelete,
    user: dict = Depends(get_current_user),
):
    """Delete a system user. Requires confirmation. Cannot delete yourself."""
    if body.confirm != username:
        raise HTTPException(status_code=400, detail="Confirmation does not match username")
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    try:
        await users.delete_system_user(username)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.delete", username)
    return {"message": f"User '{username}' deleted"}


@router.patch("/{username}/password")
async def change_system_password(
    username: str,
    body: SystemPasswordChange,
    user: dict = Depends(get_current_user),
):
    """Change a system user's password."""
    try:
        await users.change_system_password(username, body.password)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.password", username)
    return {"message": f"Password changed for '{username}'"}


# --- Group membership ---


@router.post("/{username}/groups/{group}")
async def add_to_group(
    username: str,
    group: str,
    user: dict = Depends(get_current_user),
):
    """Add a user to a group."""
    try:
        await users.add_user_to_group(username, group)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.group.add", f"{username} -> {group}")
    return {"message": f"Added '{username}' to group '{group}'"}


@router.delete("/{username}/groups/{group}")
async def remove_from_group(
    username: str,
    group: str,
    user: dict = Depends(get_current_user),
):
    """Remove a user from a group."""
    try:
        await users.remove_user_from_group(username, group)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.group.remove", f"{username} -> {group}")
    return {"message": f"Removed '{username}' from group '{group}'"}
