"""Tests for services/zpool.py — parse_status_output and _parse_config_lines.

Uses realistic zpool status output captured from production systems.
Covers:
- Simple mirror pool
- raidz2 pool with spares, logs, and cache
- Degraded pool with faulted devices and error counts
- Pool with active scrub
- Pool with status and action messages that span multiple lines
- Empty / minimal output
"""

import pytest

from services.zpool import parse_status_output, _parse_config_lines


# ===================================================================
# Sample zpool status outputs
# ===================================================================

SIMPLE_MIRROR = """\
  pool: tank
 state: ONLINE
  scan: scrub repaired 0B in 00:01:30 with 0 errors on Sun Jan 14 00:25:00 2024
config:

\tNAME        STATE     READ WRITE CKSUM
\ttank        ONLINE       0     0     0
\t  mirror-0  ONLINE       0     0     0
\t    sda     ONLINE       0     0     0
\t    sdb     ONLINE       0     0     0

errors: No known data errors
"""

RAIDZ2_WITH_SPECIAL_VDEVS = """\
  pool: datapool
 state: ONLINE
  scan: scrub repaired 0B in 02:15:00 with 0 errors on Sun Jan 14 02:15:00 2024
config:

\tNAME          STATE     READ WRITE CKSUM
\tdatapool      ONLINE       0     0     0
\t  raidz2-0    ONLINE       0     0     0
\t    sda       ONLINE       0     0     0
\t    sdb       ONLINE       0     0     0
\t    sdc       ONLINE       0     0     0
\t    sdd       ONLINE       0     0     0
\t    sde       ONLINE       0     0     0
\tlogs
\t  nvme0n1     ONLINE       0     0     0
\tcache
\t  nvme1n1     ONLINE       0     0     0
\tspares
\t  sdf         AVAIL

errors: No known data errors
"""

DEGRADED_POOL = """\
  pool: tank
 state: DEGRADED
status: One or more devices has been removed by the administrator.
\tSufficient replicas exist for the pool to continue functioning in a
\tdegraded state.
action: Online the device using 'zpool online' or replace the device with
\t'zpool replace'.
  scan: scrub in progress since Sun Jan 14 00:00:00 2024
\t500G scanned at 100M/s, 250G issued at 50M/s, 1T total
\t0B repaired, 25.0% done, 04:00:00 to go
config:

\tNAME        STATE     READ WRITE CKSUM
\ttank        DEGRADED     0     0     0
\t  mirror-0  DEGRADED     0     0     0
\t    sda     ONLINE       0     0     0
\t    sdb     FAULTED      3    12     0  too many errors
\t  mirror-1  ONLINE       0     0     0
\t    sdc     ONLINE       0     0     0
\t    sdd     ONLINE       0     0     0

errors: No known data errors
"""

MINIMAL_OUTPUT = """\
  pool: tiny
 state: ONLINE
config:

\tNAME   STATE     READ WRITE CKSUM
\ttiny   ONLINE       0     0     0
\t  sda  ONLINE       0     0     0

errors: No known data errors
"""

POOL_WITH_ERRORS = """\
  pool: tank
 state: ONLINE
status: One or more devices has experienced an unrecoverable error.  An
\tattempt was made to correct the error.  Applications are unaffected.
action: Determine if the device needs to be replaced, and clear the errors
\tusing 'zpool clear' or replace the device with 'zpool replace'.
  scan: scrub repaired 4K in 00:30:00 with 2 errors on Sun Jan 14 00:30:00 2024
config:

\tNAME        STATE     READ WRITE CKSUM
\ttank        ONLINE       0     0     0
\t  raidz1-0  ONLINE       0     0     0
\t    sda     ONLINE       0     0     2
\t    sdb     ONLINE       1     0     0
\t    sdc     ONLINE       0     0     0

errors: 2 data errors, use '-v' for a list
"""


# ===================================================================
# Tests: parse_status_output
# ===================================================================


class TestParseStatusOutput:
    """Test the top-level parser that extracts sections from zpool status."""

    def test_state_extraction(self):
        result = parse_status_output(SIMPLE_MIRROR)
        assert result["state"] == "ONLINE"

    def test_degraded_state(self):
        result = parse_status_output(DEGRADED_POOL)
        assert result["state"] == "DEGRADED"

    def test_scan_extraction(self):
        result = parse_status_output(SIMPLE_MIRROR)
        assert "scrub repaired 0B" in result["scan"]

    def test_multiline_scan(self):
        """Scrub-in-progress output spans multiple lines."""
        result = parse_status_output(DEGRADED_POOL)
        assert "scrub in progress" in result["scan"]
        assert "25.0% done" in result["scan"]

    def test_errors_no_data_errors(self):
        result = parse_status_output(SIMPLE_MIRROR)
        assert result["errors"] == "No known data errors"

    def test_errors_with_data_errors(self):
        result = parse_status_output(POOL_WITH_ERRORS)
        assert "2 data errors" in result["errors"]

    def test_multiline_status(self):
        """status: lines can span multiple lines with tab-indented continuations."""
        result = parse_status_output(DEGRADED_POOL)
        assert "One or more devices" in result["status"]
        assert "degraded state" in result["status"]

    def test_multiline_action(self):
        result = parse_status_output(DEGRADED_POOL)
        assert "Online the device" in result["action"]
        assert "'zpool replace'" in result["action"]

    def test_no_status_or_action(self):
        """A healthy pool may not have status: or action: sections."""
        result = parse_status_output(SIMPLE_MIRROR)
        assert result["status"] == ""
        assert result["action"] == ""

    def test_config_is_list(self):
        result = parse_status_output(SIMPLE_MIRROR)
        assert isinstance(result["config"], list)
        assert len(result["config"]) > 0

    def test_minimal_output(self):
        result = parse_status_output(MINIMAL_OUTPUT)
        assert result["state"] == "ONLINE"
        assert len(result["config"]) > 0

    def test_empty_input(self):
        result = parse_status_output("")
        assert result["state"] == ""
        assert result["config"] == []


# ===================================================================
# Tests: config / device tree parsing
# ===================================================================


class TestConfigParsing:
    """Test device tree structure extracted from the config: section."""

    def test_simple_mirror_structure(self):
        result = parse_status_output(SIMPLE_MIRROR)
        config = result["config"]

        # Root: pool device "tank"
        assert len(config) == 1
        tank = config[0]
        assert tank["name"] == "tank"
        assert tank["state"] == "ONLINE"

        # Child: mirror-0
        assert len(tank["children"]) == 1
        mirror = tank["children"][0]
        assert mirror["name"] == "mirror-0"
        assert mirror["state"] == "ONLINE"

        # Grandchildren: sda, sdb
        assert len(mirror["children"]) == 2
        assert mirror["children"][0]["name"] == "sda"
        assert mirror["children"][1]["name"] == "sdb"

    def test_raidz2_with_special_vdevs(self):
        """Pool with raidz2, log, cache, and spare vdevs."""
        result = parse_status_output(RAIDZ2_WITH_SPECIAL_VDEVS)
        config = result["config"]

        # Root: datapool
        assert len(config) == 1
        pool = config[0]
        assert pool["name"] == "datapool"

        # Children: raidz2-0, logs, cache, spares
        child_names = [c["name"] for c in pool["children"]]
        assert "raidz2-0" in child_names
        assert "logs" in child_names
        assert "cache" in child_names
        assert "spares" in child_names

        # raidz2-0 should have 5 disks
        raidz = next(c for c in pool["children"] if c["name"] == "raidz2-0")
        assert len(raidz["children"]) == 5

        # logs has one device
        logs = next(c for c in pool["children"] if c["name"] == "logs")
        assert len(logs["children"]) == 1
        assert logs["children"][0]["name"] == "nvme0n1"

        # cache has one device
        cache = next(c for c in pool["children"] if c["name"] == "cache")
        assert len(cache["children"]) == 1
        assert cache["children"][0]["name"] == "nvme1n1"

        # spares has one device
        spares = next(c for c in pool["children"] if c["name"] == "spares")
        assert len(spares["children"]) == 1
        assert spares["children"][0]["name"] == "sdf"
        assert spares["children"][0]["state"] == "AVAIL"

    def test_degraded_pool_device_states(self):
        """Faulted devices should have their state and error counts."""
        result = parse_status_output(DEGRADED_POOL)
        config = result["config"]
        tank = config[0]

        # mirror-0 is degraded
        mirror0 = tank["children"][0]
        assert mirror0["name"] == "mirror-0"
        assert mirror0["state"] == "DEGRADED"

        # sdb is faulted with errors
        sdb = mirror0["children"][1]
        assert sdb["name"] == "sdb"
        assert sdb["state"] == "FAULTED"
        assert sdb["read_errors"] == "3"
        assert sdb["write_errors"] == "12"
        assert sdb["checksum_errors"] == "0"

    def test_pool_with_errors_checksum(self):
        """Devices with non-zero checksum errors."""
        result = parse_status_output(POOL_WITH_ERRORS)
        config = result["config"]
        raidz = config[0]["children"][0]

        sda = raidz["children"][0]
        assert sda["name"] == "sda"
        assert sda["checksum_errors"] == "2"

        sdb = raidz["children"][1]
        assert sdb["read_errors"] == "1"

    def test_multiple_mirror_groups(self):
        """Degraded pool has two mirror groups."""
        result = parse_status_output(DEGRADED_POOL)
        tank = result["config"][0]
        assert len(tank["children"]) == 2
        assert tank["children"][0]["name"] == "mirror-0"
        assert tank["children"][1]["name"] == "mirror-1"

    def test_device_default_errors(self):
        """Devices without explicit error columns get '0' defaults."""
        # The spare 'sdf' only has "AVAIL" state and no error columns
        result = parse_status_output(RAIDZ2_WITH_SPECIAL_VDEVS)
        spares = next(
            c for c in result["config"][0]["children"] if c["name"] == "spares"
        )
        sdf = spares["children"][0]
        # spares have no error counts in zpool status; parser defaults to "0"
        assert sdf["read_errors"] == "0"
        assert sdf["write_errors"] == "0"
        assert sdf["checksum_errors"] == "0"


class TestParseConfigLines:
    """Direct tests for _parse_config_lines helper."""

    def test_empty_input(self):
        assert _parse_config_lines([]) == []

    def test_header_only(self):
        lines = ["\tNAME        STATE     READ WRITE CKSUM"]
        result = _parse_config_lines(lines)
        assert result == []

    def test_single_device(self):
        lines = [
            "\tNAME   STATE     READ WRITE CKSUM",
            "\ttiny   ONLINE       0     0     0",
            "\t  sda  ONLINE       0     0     0",
        ]
        result = _parse_config_lines(lines)
        assert len(result) == 1
        assert result[0]["name"] == "tiny"
        assert len(result[0]["children"]) == 1
        assert result[0]["children"][0]["name"] == "sda"

    def test_preserves_children_list(self):
        """Every device node must have a 'children' list, even if empty."""
        lines = [
            "\tNAME   STATE     READ WRITE CKSUM",
            "\ttiny   ONLINE       0     0     0",
            "\t  sda  ONLINE       0     0     0",
        ]
        result = _parse_config_lines(lines)
        leaf = result[0]["children"][0]
        assert leaf["children"] == []
