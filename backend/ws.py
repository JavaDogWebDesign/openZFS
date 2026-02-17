"""WebSocket endpoints for real-time streaming.

- /api/ws/iostat?pool=<name> — streams zpool iostat data
- /api/ws/events — streams zpool events
- /api/ws/send-progress — streams zfs send progress (future)
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services import zpool

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/iostat")
async def ws_iostat(ws: WebSocket, pool: str = ""):
    """Stream zpool iostat data over WebSocket."""
    if not pool:
        await ws.close(code=1008, reason="Missing pool parameter")
        return

    await ws.accept()
    logger.info("WebSocket iostat stream started for pool: %s", pool)

    try:
        async for sample in zpool.iostat_stream(pool, interval=1):
            await ws.send_json(sample)
    except WebSocketDisconnect:
        logger.info("WebSocket iostat client disconnected (pool: %s)", pool)
    except Exception as e:
        logger.error("WebSocket iostat error: %s", e)
        try:
            await ws.close(code=1011, reason=str(e))
        except Exception:
            pass


@router.websocket("/events")
async def ws_events(ws: WebSocket):
    """Stream zpool events over WebSocket."""
    await ws.accept()
    logger.info("WebSocket events stream started")

    try:
        async for event_line in zpool.events_stream():
            await ws.send_json({"event": event_line})
    except WebSocketDisconnect:
        logger.info("WebSocket events client disconnected")
    except Exception as e:
        logger.error("WebSocket events error: %s", e)
        try:
            await ws.close(code=1011, reason=str(e))
        except Exception:
            pass


@router.websocket("/send-progress")
async def ws_send_progress(ws: WebSocket):
    """Stream zfs send progress over WebSocket.

    The client initiates a send by posting to /api/replication/send,
    then connects here to receive progress updates. Progress data
    is parsed from `zfs send -v` stderr output.
    """
    await ws.accept()
    logger.info("WebSocket send-progress stream started")

    try:
        # Wait for client to specify the send parameters
        data = await ws.receive_json()
        snapshot = data.get("snapshot", "")
        incremental_from = data.get("incremental_from")
        destination = data.get("destination", "")
        raw = data.get("raw", False)
        compressed = data.get("compressed", False)

        if not snapshot or not destination:
            await ws.send_json({"error": "Missing snapshot or destination"})
            await ws.close()
            return

        # Build the send command
        send_cmd = ["zfs", "send", "-v"]
        if raw:
            send_cmd.append("-w")
        if compressed:
            send_cmd.append("-c")
        if incremental_from:
            send_cmd.extend(["-i", incremental_from])
        send_cmd.extend(["--", snapshot])

        # Build the receive command
        recv_cmd = ["zfs", "receive", "-F", "-s", "--", destination]

        await ws.send_json({"status": "starting", "snapshot": snapshot})

        # Pipe send into receive
        send_proc = await asyncio.create_subprocess_exec(
            *send_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        recv_proc = await asyncio.create_subprocess_exec(
            *recv_cmd,
            stdin=send_proc.stdout,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Parse progress from send's stderr
        assert send_proc.stderr is not None
        async for raw_line in send_proc.stderr:
            line = raw_line.decode().strip()
            if line:
                await ws.send_json({"status": "progress", "line": line})

        # Wait for both to finish
        await send_proc.wait()
        recv_stderr = (await recv_proc.communicate())[1].decode()

        if send_proc.returncode == 0 and recv_proc.returncode == 0:
            await ws.send_json({"status": "complete"})
        else:
            error = recv_stderr or f"Send exited with {send_proc.returncode}"
            await ws.send_json({"status": "error", "error": error})

    except WebSocketDisconnect:
        logger.info("WebSocket send-progress client disconnected")
    except Exception as e:
        logger.error("WebSocket send-progress error: %s", e)
        try:
            await ws.send_json({"status": "error", "error": str(e)})
            await ws.close()
        except Exception:
            pass
