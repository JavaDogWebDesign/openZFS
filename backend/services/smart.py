"""SMART health data via smartctl."""

import asyncio
import json
import logging
from typing import Any

from services.cmd import run_cmd

logger = logging.getLogger(__name__)


async def get_smart_health(device: str) -> dict[str, Any]:
    """Get SMART health info for a single device.

    Runs smartctl --json=c and parses the JSON response.
    Returns a dict with available, healthy, temperature, etc.
    Gracefully returns available=False for unsupported devices.
    """
    stdout, stderr, rc = await run_cmd([
        "smartctl", "--json=c", "--info", "--health", "--attributes", "--", device,
    ])

    result: dict[str, Any] = {
        "available": False,
        "healthy": None,
        "temperature": None,
        "power_on_hours": None,
        "model_family": None,
        "firmware_version": None,
        "rotation_rate": None,
        "form_factor": None,
        "smart_error_log_count": None,
    }

    if not stdout.strip():
        return result

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        logger.warning("Failed to parse smartctl JSON for %s", device)
        return result

    # smartctl returns exit code as bitmask; bit 0 = command parse error,
    # bit 1 = device open failed.  Bits 2+ are SMART-level warnings.
    # If bits 0 or 1 are set and we got no useful data, bail out.
    if rc & 0x03 and "smart_status" not in data:
        return result

    result["available"] = True

    # Health
    smart_status = data.get("smart_status", {})
    if isinstance(smart_status, dict) and "passed" in smart_status:
        result["healthy"] = smart_status["passed"]

    # Device info
    result["model_family"] = data.get("model_family")
    result["firmware_version"] = data.get("firmware_version")
    result["rotation_rate"] = data.get("rotation_rate")
    result["form_factor"] = data.get("form_factor")

    # Temperature
    temp = data.get("temperature", {})
    if isinstance(temp, dict):
        result["temperature"] = temp.get("current")

    # Power-on hours and error log from SMART attributes table
    attrs = data.get("ata_smart_attributes", {}).get("table", [])
    for attr in attrs:
        attr_id = attr.get("id")
        raw_val = attr.get("raw", {}).get("value")
        if attr_id == 9:  # Power_On_Hours
            result["power_on_hours"] = raw_val
        elif attr_id == 199:  # UDMA_CRC_Error_Count or similar
            pass

    # NVMe power-on hours
    if result["power_on_hours"] is None:
        nvme_health = data.get("nvme_smart_health_information_log", {})
        if isinstance(nvme_health, dict):
            result["power_on_hours"] = nvme_health.get("power_on_hours")
            if result["temperature"] is None:
                result["temperature"] = nvme_health.get("temperature")

    # Error log count
    error_log = data.get("ata_smart_error_log", {}).get("summary", {})
    if isinstance(error_log, dict):
        result["smart_error_log_count"] = error_log.get("count")

    return result


async def get_all_smart(devices: list[str]) -> dict[str, dict[str, Any]]:
    """Get SMART health for multiple devices in parallel.

    Returns a dict mapping device path -> SMART info.
    Uses asyncio.gather; concurrency is throttled by run_cmd's semaphore.
    """
    tasks = [get_smart_health(dev) for dev in devices]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: dict[str, dict[str, Any]] = {}
    for dev, res in zip(devices, results):
        if isinstance(res, Exception):
            logger.warning("SMART query failed for %s: %s", dev, res)
            out[dev] = {"available": False}
        else:
            out[dev] = res

    return out
