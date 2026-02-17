"""PAM authentication middleware and session management.

Uses python-pam to authenticate against system users.
Sessions are stored in SQLite (see db.py).
"""

import logging

import pam
from fastapi import Cookie, Depends, HTTPException, Request, Response

from db import create_session, delete_session, get_session

logger = logging.getLogger(__name__)

_pam = pam.pam()

COOKIE_NAME = "zfs_session"


def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user via PAM."""
    return _pam.authenticate(username, password)


async def login(username: str, password: str, response: Response) -> dict:
    """Authenticate and create a session cookie."""
    if not authenticate_user(username, password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session_id = await create_session(username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        path="/api",
        max_age=86400,
    )
    logger.info("User %s logged in", username)
    return {"username": username, "message": "Login successful"}


async def logout(response: Response, session_id: str | None = None) -> dict:
    """Delete the session and clear the cookie."""
    if session_id:
        await delete_session(session_id)
    response.delete_cookie(key=COOKIE_NAME, path="/api")
    return {"message": "Logged out"}


async def get_current_user(
    request: Request,
    zfs_session: str | None = Cookie(None),
) -> dict:
    """Dependency: get the current authenticated user from the session cookie.

    Also validates the X-Requested-With header for CSRF protection on
    state-changing requests (POST, PUT, DELETE, PATCH).
    """
    # CSRF check for mutating methods
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        if request.headers.get("X-Requested-With") != "XMLHttpRequest":
            raise HTTPException(status_code=403, detail="Missing CSRF header")

    if not zfs_session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await get_session(zfs_session)
    if session is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    return {"username": session["username"]}
