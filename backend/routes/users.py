"""User and group management API routes."""

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models import (
    AccountExpiration,
    AccountStatusUpdate,
    ForcePasswordChange,
    GroupCreate,
    GroupDelete,
    GroupRename,
    ShellChange,
    SystemPasswordChange,
    SystemUserCreate,
    SystemUserDelete,
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


@router.patch("/groups/{name}/rename")
async def rename_group(name: str, body: GroupRename, user: dict = Depends(get_current_user)):
    """Rename a system group."""
    try:
        await users.rename_group(name, body.new_name)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "group.rename", f"{name} -> {body.new_name}")
    return {"message": f"Group '{name}' renamed to '{body.new_name}'"}


# --- Shells (before /{username} routes) ---


@router.get("/shells")
async def list_shells(user: dict = Depends(get_current_user)):
    """List available login shells from /etc/shells."""
    return await users.list_shells()


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


# --- Account management ---


@router.get("/{username}/status")
async def get_account_status(username: str, user: dict = Depends(get_current_user)):
    """Get account lock/expiration status."""
    try:
        return await users.get_account_status(username)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{username}/lock")
async def lock_account(
    username: str,
    body: AccountStatusUpdate,
    user: dict = Depends(get_current_user),
):
    """Lock or unlock a user account."""
    try:
        if body.locked:
            await users.lock_account(username)
        else:
            await users.unlock_account(username)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    action = "locked" if body.locked else "unlocked"
    await audit_log(user["username"], f"user.{action}", username)
    return {"message": f"Account '{username}' {action}"}


@router.post("/{username}/force-password-change")
async def force_password_change(
    username: str,
    user: dict = Depends(get_current_user),
):
    """Force a password change on next login."""
    try:
        await users.force_password_change(username)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.force-pw-change", username)
    return {"message": f"Password change forced for '{username}'"}


@router.patch("/{username}/expiration")
async def set_account_expiration(
    username: str,
    body: AccountExpiration,
    user: dict = Depends(get_current_user),
):
    """Set account/password expiration."""
    try:
        await users.set_account_expiration(username, body.expire_date, body.max_days)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.expiration", username)
    return {"message": f"Expiration updated for '{username}'"}


@router.patch("/{username}/shell")
async def change_shell(
    username: str,
    body: ShellChange,
    user: dict = Depends(get_current_user),
):
    """Change a user's login shell."""
    try:
        await users.change_shell(username, body.shell)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_log(user["username"], "user.shell", username, detail=body.shell)
    return {"message": f"Shell changed for '{username}' to '{body.shell}'"}


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
