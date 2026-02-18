"""Dataset management API routes."""

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models import (
    DatasetCreateRequest,
    DatasetDestroyRequest,
    InheritRequest,
    LoadKeyRequest,
    ChangeKeyRequest,
    PermissionSetRequest,
    PropertySetRequest,
    ShareRequest,
)
from services import zfs
from db import audit_log

router = APIRouter()


@router.get("")
async def list_datasets(
    pool: str | None = None,
    type: str = "filesystem,volume",
    user: dict = Depends(get_current_user),
):
    """List all datasets, optionally filtered by pool."""
    return await zfs.list_datasets(pool=pool, dataset_type=type)


@router.get("/{name:path}/properties")
async def get_dataset_properties(name: str, user: dict = Depends(get_current_user)):
    """Get all properties for a dataset."""
    return await zfs.get_properties(name)


@router.post("")
async def create_dataset(body: DatasetCreateRequest, user: dict = Depends(get_current_user)):
    """Create a new dataset or volume."""
    await zfs.create_dataset(
        name=body.name,
        volume_size=body.volume_size,
        properties=body.properties,
    )
    await audit_log(user["username"], "dataset.create", body.name)
    return {"message": f"Dataset {body.name} created"}


@router.delete("/{name:path}")
async def destroy_dataset(name: str, body: DatasetDestroyRequest, user: dict = Depends(get_current_user)):
    """Destroy a dataset. Requires confirmation."""
    if body.confirm != name:
        raise HTTPException(status_code=400, detail="Confirmation does not match dataset name")
    await zfs.destroy(name, recursive=body.recursive, force=body.force)
    await audit_log(user["username"], "dataset.destroy", name)
    return {"message": f"Dataset {name} destroyed"}


@router.patch("/{name:path}/properties")
async def set_properties(name: str, body: PropertySetRequest, user: dict = Depends(get_current_user)):
    """Set properties on a dataset."""
    for prop, value in body.properties.items():
        await zfs.set_property(name, prop, value)
    await audit_log(user["username"], "dataset.set", name, detail=str(body.properties))
    return {"message": "Properties updated"}


@router.post("/{name:path}/inherit")
async def inherit_property(name: str, body: InheritRequest, user: dict = Depends(get_current_user)):
    """Inherit a property from the parent."""
    await zfs.inherit_property(name, body.property, recursive=body.recursive)
    return {"message": f"Property {body.property} inherited"}


@router.post("/{name:path}/mount")
async def mount_dataset(name: str, user: dict = Depends(get_current_user)):
    """Mount a dataset."""
    await zfs.mount(name)
    return {"message": f"Dataset {name} mounted"}


@router.post("/{name:path}/unmount")
async def unmount_dataset(name: str, user: dict = Depends(get_current_user)):
    """Unmount a dataset."""
    await zfs.unmount(name)
    return {"message": f"Dataset {name} unmounted"}


@router.post("/{name:path}/share")
async def share_dataset(name: str, body: ShareRequest, user: dict = Depends(get_current_user)):
    """Share a dataset via NFS or SMB."""
    if body.options:
        prop = "sharenfs" if body.protocol == "nfs" else "sharesmb"
        await zfs.set_property(name, prop, body.options)
    await zfs.share(name)
    await audit_log(user["username"], "dataset.share", name, detail=body.protocol)
    return {"message": f"Dataset {name} shared via {body.protocol}"}


@router.post("/{name:path}/unshare")
async def unshare_dataset(name: str, user: dict = Depends(get_current_user)):
    """Unshare a dataset by resetting sharenfs and sharesmb to off."""
    # Reset share properties — this also unshares the dataset
    await zfs.set_property(name, "sharenfs", "off")
    await zfs.set_property(name, "sharesmb", "off")
    await audit_log(user["username"], "dataset.unshare", name)
    return {"message": f"Dataset {name} unshared"}


# --- Encryption ---


@router.post("/{name:path}/load-key")
async def load_key(name: str, body: LoadKeyRequest, user: dict = Depends(get_current_user)):
    """Load an encryption key."""
    await zfs.load_key(name, passphrase=body.passphrase, key_file=body.key_file)
    await audit_log(user["username"], "dataset.load-key", name)
    return {"message": f"Key loaded for {name}"}


@router.post("/{name:path}/unload-key")
async def unload_key(name: str, user: dict = Depends(get_current_user)):
    """Unload an encryption key."""
    await zfs.unload_key(name)
    await audit_log(user["username"], "dataset.unload-key", name)
    return {"message": f"Key unloaded for {name}"}


@router.post("/{name:path}/change-key")
async def change_key(name: str, body: ChangeKeyRequest, user: dict = Depends(get_current_user)):
    """Change the encryption key."""
    await zfs.change_key(name, new_passphrase=body.new_passphrase, new_key_file=body.new_key_file)
    await audit_log(user["username"], "dataset.change-key", name)
    return {"message": f"Key changed for {name}"}


# --- Permissions ---


@router.get("/{name:path}/permissions")
async def get_permissions(name: str, user: dict = Depends(get_current_user)):
    """Get delegated permissions."""
    raw = await zfs.get_permissions(name)
    return {"raw": raw}


@router.post("/{name:path}/permissions")
async def set_permissions(name: str, body: PermissionSetRequest, user: dict = Depends(get_current_user)):
    """Delegate permissions to a user or group."""
    await zfs.allow(name, body.entity, body.permissions, entity_type=body.entity_type)
    await audit_log(user["username"], "dataset.allow", name, detail=f"{body.entity}: {body.permissions}")
    return {"message": "Permissions set"}


@router.delete("/{name:path}/permissions")
async def remove_permissions(name: str, body: PermissionSetRequest, user: dict = Depends(get_current_user)):
    """Remove delegated permissions."""
    await zfs.unallow(name, body.entity, body.permissions, entity_type=body.entity_type)
    await audit_log(user["username"], "dataset.unallow", name)
    return {"message": "Permissions removed"}


# --- Space accounting ---


@router.get("/{name:path}/userspace")
async def get_userspace(name: str, user: dict = Depends(get_current_user)):
    """Get per-user space usage."""
    return await zfs.userspace(name)


@router.get("/{name:path}/groupspace")
async def get_groupspace(name: str, user: dict = Depends(get_current_user)):
    """Get per-group space usage."""
    return await zfs.groupspace(name)
