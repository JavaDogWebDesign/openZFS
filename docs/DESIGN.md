# ZFS Web GUI — Command Research, Feature Map & Interface Design

## Part 1: Complete ZFS Command Inventory

All commands sourced from the [OpenZFS man pages (master branch)](https://openzfs.github.io/openzfs-docs/man/master/8/zfs.8.html).

### `zfs` Subcommands (Dataset Layer)

| Command | Purpose | Destructive? |
|---|---|---|
| `zfs list` | List datasets, filesystems, volumes, snapshots | No |
| `zfs create` | Create filesystem or volume | No |
| `zfs destroy` | Destroy dataset, snapshot, or bookmark | **Yes** |
| `zfs rename` | Rename dataset or snapshot | Moderate |
| `zfs upgrade` | Upgrade on-disk filesystem version | Moderate |
| `zfs snapshot` | Create a point-in-time snapshot | No |
| `zfs rollback` | Revert dataset to a previous snapshot | **Yes** |
| `zfs hold` | Place a hold on a snapshot (prevents destroy) | No |
| `zfs release` | Release a hold on a snapshot | Moderate |
| `zfs diff` | Show differences between snapshots or snapshot vs current | No |
| `zfs clone` | Create a writable clone from a snapshot | No |
| `zfs promote` | Promote a clone to be independent of its origin | Moderate |
| `zfs send` | Generate a replication stream | No |
| `zfs receive` (`recv`) | Apply a replication stream | Moderate |
| `zfs bookmark` | Create a bookmark from a snapshot | No |
| `zfs redact` | Create a redaction bookmark for filtered send | No |
| `zfs get` | Display dataset properties | No |
| `zfs set` | Set dataset properties | Moderate |
| `zfs inherit` | Clear a property (inherit from parent) | Moderate |
| `zfs userspace` | Show per-user space usage | No |
| `zfs groupspace` | Show per-group space usage | No |
| `zfs projectspace` | Show per-project space usage | No |
| `zfs project` | Manage project IDs on datasets | Moderate |
| `zfs mount` | Mount a ZFS filesystem | No |
| `zfs unmount` | Unmount a ZFS filesystem | Moderate |
| `zfs share` | Share a filesystem (NFS/SMB) | No |
| `zfs unshare` | Unshare a filesystem | Moderate |
| `zfs allow` | Delegate ZFS permissions to users | Moderate |
| `zfs unallow` | Remove delegated permissions | Moderate |
| `zfs load-key` | Load encryption key for a dataset | No |
| `zfs unload-key` | Unload encryption key | Moderate |
| `zfs change-key` | Change or convert encryption key | Moderate |
| `zfs jail` / `zfs zone` | Attach dataset to a jail/zone | Moderate |
| `zfs unjail` / `zfs unzone` | Detach dataset from a jail/zone | Moderate |
| `zfs program` | Execute a ZFS channel program (Lua) | Moderate |
| `zfs wait` | Wait for background activity to complete | No |
| `zfs rewrite` | Rewrite data blocks (for migration/upgrade) | Moderate |

### `zpool` Subcommands (Pool Layer)

| Command | Purpose | Destructive? |
|---|---|---|
| `zpool create` | Create a new storage pool | No |
| `zpool destroy` | Destroy a pool and all its data | **Yes** |
| `zpool initialize` | Write to unallocated regions (prep new disks) | No |
| `zpool labelclear` | Remove ZFS label from a device | **Yes** |
| `zpool add` | Add vdevs to an existing pool | Moderate |
| `zpool remove` | Remove a device from a pool | Moderate |
| `zpool attach` | Add a mirror to a device (convert to mirror) | No |
| `zpool detach` | Remove a device from a mirror | Moderate |
| `zpool replace` | Replace a device (e.g. failed disk) | Moderate |
| `zpool split` | Split a mirror into a new pool | Moderate |
| `zpool list` | List pools with health and space | No |
| `zpool get` | Get pool properties | No |
| `zpool set` | Set pool properties | Moderate |
| `zpool status` | Detailed pool status, device tree, errors | No |
| `zpool iostat` | I/O statistics (live or snapshot) | No |
| `zpool events` | List kernel events (used by zed) | No |
| `zpool history` | Command history for a pool | No |
| `zpool import` | Import a pool (discover or by name/ID) | Moderate |
| `zpool export` | Export (cleanly detach) a pool | Moderate |
| `zpool scrub` | Start/stop/pause integrity scrub | No |
| `zpool resilver` | Restart resilvering | No |
| `zpool trim` | Issue TRIM/UNMAP to SSDs | No |
| `zpool checkpoint` | Save pool state for rollback | No |
| `zpool clear` | Clear device errors | No |
| `zpool reopen` | Reopen pool devices | No |
| `zpool online` | Bring a device online | No |
| `zpool offline` | Take a device offline | Moderate |
| `zpool reguid` | Generate a new pool GUID | Moderate |
| `zpool upgrade` | Upgrade pool on-disk format | Moderate |
| `zpool sync` | Force sync of in-core dirty data | No |
| `zpool wait` | Wait for pool background activity | No |
| `zpool prefetch` | Prefetch specific pool data types | No |
| `zpool ddtprune` | Prune dedup table entries | Moderate |

### Supporting Utilities

| Utility | Purpose |
|---|---|
| `zdb` | ZFS debugger — low-level pool/dataset inspection |
| `zed` | ZFS Event Daemon — automated responses to events |
| `zstream` | Manipulate send streams |
| `zinject` | Inject faults for testing |
| `zgenhostid` | Generate /etc/hostid for multi-host pools |

---

## Part 2: Feature Categories

Organizing all commands into logical feature groups for the GUI:

### 1. Dashboard / Overview
- `zpool list` — all pools at a glance
- `zpool status` — health summary
- `zpool iostat` — live performance
- `zfs list` — dataset tree
- `zpool events` — recent events feed

### 2. Pool Management
- `zpool create` — guided pool creation (mirror, raidz, raidz2, raidz3, stripe)
- `zpool destroy` — with confirmation dialog
- `zpool import` / `zpool export` — pool portability
- `zpool upgrade` — version management
- `zpool get` / `zpool set` — pool properties editor
- `zpool checkpoint` — save/restore pool state
- `zpool reguid` — regenerate GUID
- `zpool history` — audit log viewer

### 3. Device Management
- `zpool status` — device tree visualization
- `zpool add` — add vdevs (data, log, cache, spare)
- `zpool remove` — remove devices
- `zpool attach` / `zpool detach` — mirror management
- `zpool replace` — disk replacement workflow
- `zpool split` — mirror splitting
- `zpool online` / `zpool offline` — device state control
- `zpool reopen` — re-probe devices
- `zpool clear` — clear error counters
- `zpool initialize` — initialize new devices
- `zpool trim` — SSD TRIM management

### 4. Dataset & Volume Management
- `zfs create` — create filesystem or zvol
- `zfs destroy` — with dependency warnings
- `zfs rename` — rename/relocate datasets
- `zfs list` — hierarchical browser
- `zfs get` / `zfs set` / `zfs inherit` — property editor
- `zfs mount` / `zfs unmount` — mount control
- `zfs upgrade` — dataset version
- `zfs project` — project quota management
- `zfs rewrite` — block rewriting

### 5. Snapshots & Clones
- `zfs snapshot` — create (single or recursive)
- `zfs destroy` (snapshots) — with hold warnings
- `zfs rollback` — revert to snapshot
- `zfs diff` — visual diff between snapshots
- `zfs hold` / `zfs release` — snapshot protection
- `zfs clone` — create writable clone
- `zfs promote` — promote clone to independent dataset
- `zfs bookmark` — lightweight snapshot references

### 6. Replication (Send/Receive)
- `zfs send` — full, incremental, resumable, raw, redacted
- `zfs receive` — apply stream (local or remote via SSH)
- `zfs bookmark` — incremental source markers
- `zfs redact` — filtered replication for tenant isolation
- Scheduled replication jobs (application-level, wraps send/recv)

### 7. Sharing & Networking
- `zfs share` / `zfs unshare` — NFS and SMB sharing
- `zfs set sharenfs=...` / `zfs set sharesmb=...` — share properties
- Integration with `/etc/exports` and Samba config

### 8. Encryption
- `zfs create -o encryption=on` — encrypted datasets
- `zfs load-key` / `zfs unload-key` — key management
- `zfs change-key` — rotate or convert keys
- Encryption property display (algorithm, keystatus, keyformat)

### 9. Permissions & Delegation
- `zfs allow` — delegate operations to non-root users
- `zfs unallow` — revoke delegation
- Per-dataset permission display

### 10. Quotas & Space Accounting
- `zfs set quota=` / `zfs set refquota=`
- `zfs set reservation=` / `zfs set refreservation=`
- `zfs userspace` / `zfs groupspace` / `zfs projectspace`
- Visual space usage breakdown

### 11. Health & Monitoring
- `zpool status` — real-time pool health
- `zpool iostat` — I/O performance (live WebSocket feed)
- `zpool scrub` — scrub management (start/pause/stop, progress)
- `zpool resilver` — resilver progress
- `zpool events` — event stream
- `zpool clear` — error management
- ARC/L2ARC stats (from `/proc/spl/kstat/zfs/arcstats`)

### 12. Maintenance & Advanced
- `zpool scrub` — scheduled and on-demand
- `zpool trim` — SSD maintenance
- `zpool ddtprune` — dedup table maintenance
- `zpool sync` — force sync
- `zfs program` — channel programs (advanced)
- `zdb` — diagnostic inspection (read-only)
- `zpool history` — command audit trail

---

## Part 3: Frontend Interface Design

### Architecture Decision: Cockpit-Style Approach

Good point about Cockpit working over plain HTTP. The Cockpit model is worth adopting:

- **Localhost HTTP** — Cockpit allows unencrypted HTTP from `127.0.0.1` / `::1` by default
- **`AllowUnencrypted = true`** — in `cockpit.conf` under `[WebService]` enables HTTP from any source (for LAN-only use)
- **Reverse proxy pattern** — nginx/caddy in front handles TLS termination, forwards to `http://localhost:<port>` internally

For a ZFS GUI, the same model makes sense: the backend binds to `127.0.0.1` by default, and you optionally put a reverse proxy in front for remote access. No need to implement TLS in the app itself.

---

### Interface Layout: 7 Core Views

#### View 1: Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  ZFS Manager                              [user] [settings] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Dashboard│  ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ Pools    │  │ 3 Pools │ │ HEALTHY │ │ 12.4 TB │            │
│ Datasets │  │  total  │ │  status │ │  used   │            │
│ Snapshots│  └─────────┘ └─────────┘ └─────────┘            │
│ Replicat.│                                                  │
│ Sharing  │  Pool Health          I/O Activity               │
│ Settings │  ┌──────────────┐     ┌──────────────┐           │
│          │  │ tank  ██████ │     │  ▁▃▅▇▅▃▁▃▅  │           │
│          │  │ backup████   │     │  read / write │           │
│          │  │ ssd   ██     │     │  IOPS graph   │           │
│          │  └──────────────┘     └──────────────┘           │
│          │                                                  │
│          │  Recent Events        Active Operations          │
│          │  ┌──────────────┐     ┌──────────────┐           │
│          │  │ scrub finish │     │ scrub: 45%   │           │
│          │  │ device onlin │     │ resilver: 0  │           │
│          │  │ snapshot cre │     │ send: idle   │           │
│          │  └──────────────┘     └──────────────┘           │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**Data sources:** `zpool list`, `zpool status -x`, `zpool iostat 1` (streaming), `zpool events -H`

---

#### View 2: Pool Manager

```
┌──────────────────────────────────────────────────────────────┐
│ Pools                                    [+ Create Pool]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  tank                                                        │
│  ├── Status: ONLINE   Health: HEALTHY                        │
│  ├── Size: 20 TB   Used: 12.4 TB (62%)   Free: 7.6 TB       │
│  ├── Redundancy: RAIDZ2                                      │
│  │                                                           │
│  ├── Device Tree:                                            │
│  │   raidz2-0                                                │
│  │   ├── sda  ONLINE  0 errors                               │
│  │   ├── sdb  ONLINE  0 errors                               │
│  │   ├── sdc  ONLINE  0 errors                               │
│  │   └── sdd  ONLINE  0 errors                               │
│  │   logs                                                    │
│  │   └── nvme0n1p1  ONLINE                                   │
│  │   cache                                                   │
│  │   └── nvme0n1p2  ONLINE                                   │
│  │   spares                                                  │
│  │   └── sde  AVAIL                                          │
│  │                                                           │
│  ├── Actions:                                                │
│  │   [Scrub] [Status] [I/O Stats] [Properties]               │
│  │   [Add Device] [Replace] [Export] [Destroy ⚠]             │
│  │   [Checkpoint] [Trim] [History]                           │
│  │                                                           │
│  └── Last scrub: 2026-02-08 — 0 errors                      │
│                                                              │
│  ─────────────────────────────────────────                   │
│                                                              │
│  backup                                                      │
│  ├── Status: EXPORTED                                        │
│  └── [Import]                                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Create Pool wizard:** Step-by-step: select disks → choose topology (mirror/raidz/raidz2/raidz3) → set properties (ashift, compression, encryption) → confirm.

**Underlying commands:**
- Read: `zpool list -Hp`, `zpool status`, `zpool get all`
- Actions: `zpool create`, `zpool destroy`, `zpool scrub`, `zpool add`, `zpool attach`, `zpool replace`, `zpool import`, `zpool export`, `zpool checkpoint`, `zpool trim`, `zpool history`

---

#### View 3: Dataset Browser

```
┌───────────────────────────────────────────────────────────────┐
│ Datasets                          [+ Create] [Mount All]      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Filter: [___________]   Show: [Filesystems ▼]                │
│                                                               │
│  NAME                USED    AVAIL   REFER   MOUNT    COMP    │
│  ─────────────────────────────────────────────────────────    │
│  ▼ tank              12.4T   7.6T    128K    /tank    lz4     │
│    ▼ tank/home       800G    7.6T    64K     /home    lz4     │
│      tank/home/alice 450G    7.6T    450G    /home/a  lz4     │
│      tank/home/bob   350G    7.6T    350G    /home/b  lz4     │
│    ▶ tank/vm         6.0T    7.6T    —       —        zstd    │
│    ▶ tank/backup     4.0T    7.6T    —       /backup  off     │
│    tank/swap         8G      7.6T    —       —        —       │
│                                                               │
│  ── Selected: tank/home/alice ──────────────────────────────  │
│                                                               │
│  Properties Panel                                             │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Compression: lz4    Quota: none    Mountpoint: /home/a│    │
│  │ Encryption: off     Atime: on      Exec: on           │    │
│  │ Record Size: 128K   Copies: 1      Dedup: off         │    │
│  │                                                       │    │
│  │ [Edit Properties] [Snapshot] [Clone] [Rename]         │    │
│  │ [Unmount] [Share] [Permissions] [Destroy ⚠]           │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Space Usage                                                  │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  User       Used                                      │    │
│  │  alice      420G  ████████████████████░░░░             │    │
│  │  nobody     30G   ███░░░░░░░░░░░░░░░░░░░░             │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Underlying commands:**
- Read: `zfs list -H -o name,used,avail,refer,mountpoint,compression -r -t filesystem,volume`, `zfs get all <dataset>`, `zfs userspace <dataset>`
- Actions: `zfs create`, `zfs destroy`, `zfs rename`, `zfs set`, `zfs inherit`, `zfs mount/unmount`, `zfs share/unshare`, `zfs allow/unallow`

---

#### View 4: Snapshot Manager

```
┌───────────────────────────────────────────────────────────────┐
│ Snapshots                     [+ Create Snapshot] [Schedule]  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Dataset: [tank/home/alice ▼]     Show holds: [✓]             │
│                                                               │
│  SNAPSHOT                     CREATED              USED  HOLD │
│  ────────────────────────────────────────────────────────────│
│  tank/home/alice@daily-0210   2026-02-10 00:00     2.1G  ✓   │
│  tank/home/alice@daily-0209   2026-02-09 00:00     1.8G  ✓   │
│  tank/home/alice@daily-0208   2026-02-08 00:00     956M  —   │
│  tank/home/alice@weekly-w06   2026-02-03 00:00     4.2G  ✓   │
│  tank/home/alice@monthly-01   2026-01-01 00:00     12G   ✓   │
│                                                               │
│  ── Selected: @daily-0210 ─────────────────────────────────  │
│                                                               │
│  Actions:                                                     │
│  [Rollback ⚠] [Clone] [Hold/Release] [Diff] [Send]           │
│  [Bookmark] [Destroy ⚠]                                      │
│                                                               │
│  Diff: @daily-0209 → @daily-0210                              │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  M  /home/alice/Documents/report.docx                 │    │
│  │  +  /home/alice/Documents/new-file.txt                │    │
│  │  -  /home/alice/Downloads/temp.zip                    │    │
│  │  R  /home/alice/Photos/IMG_001.jpg → vacation/...     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Underlying commands:**
- Read: `zfs list -H -t snapshot -o name,creation,used,refer -r <dataset>`, `zfs holds <snapshot>`, `zfs diff <snap1> <snap2>`
- Actions: `zfs snapshot`, `zfs destroy`, `zfs rollback`, `zfs clone`, `zfs hold`, `zfs release`, `zfs send`, `zfs bookmark`

---

#### View 5: Replication

```
┌───────────────────────────────────────────────────────────────┐
│ Replication                               [+ New Job]         │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Active Jobs                                                  │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ tank/home → backup-server:/tank/home                  │    │
│  │ Type: Incremental   Schedule: Daily 2:00 AM           │    │
│  │ Last run: 2026-02-10 02:00 — 2.1G sent — Success     │    │
│  │ [Run Now] [Edit] [Disable] [Delete]                   │    │
│  ├───────────────────────────────────────────────────────┤    │
│  │ tank/vm → /mnt/usb-backup (local)                     │    │
│  │ Type: Full + Incremental   Schedule: Weekly           │    │
│  │ Last run: 2026-02-03 03:00 — 45G sent — Success       │    │
│  │ [Run Now] [Edit] [Disable] [Delete]                   │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Manual Send/Receive                                          │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Source: [tank/home/alice@daily-0210 ▼]                │    │
│  │ Incremental from: [tank/home/alice@daily-0209 ▼]     │    │
│  │ Destination: ○ Local file  ○ SSH remote  ○ Local pool │    │
│  │ Options: [✓] Raw  [✓] Compressed  [ ] Verbose        │    │
│  │                                     [Send →]          │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Bookmarks (incremental sources)                              │
│  tank/home/alice#daily-0210                                   │
│  tank/home/alice#weekly-w06                                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Underlying commands:**
- `zfs send [-i <snap>] <snap> | zfs receive <dest>`
- `zfs send [-i <snap>] <snap> | ssh remote zfs receive <dest>`
- `zfs bookmark <snap> <bookmark>`
- `zfs redact` — for tenant-filtered replication

---

#### View 6: Sharing & Encryption

```
┌───────────────────────────────────────────────────────────────┐
│ Sharing                                                       │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  NFS Shares                                                   │
│  DATASET              SHARE OPTIONS         STATUS            │
│  tank/shared          rw,no_root_squash     Active            │
│  tank/public          ro                    Active            │
│                                                               │
│  SMB Shares                                                   │
│  DATASET              SHARE NAME            STATUS            │
│  tank/shared          shared                Active            │
│                                                               │
│  [+ Share Dataset]  [Unshare All]                             │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Encryption                                                    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  DATASET              ALGORITHM    KEY STATUS   KEY FORMAT     │
│  tank/private         aes-256-gcm  available    passphrase     │
│  tank/vault           aes-256-gcm  unavailable  raw            │
│                                                               │
│  Actions: [Load Key] [Unload Key] [Change Key]                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

#### View 7: Settings & System

```
┌───────────────────────────────────────────────────────────────┐
│ Settings                                                      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Server Configuration                                         │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Listen address: [127.0.0.1 ▼]                         │    │
│  │ Port: [8080]                                          │    │
│  │ Auth: [PAM / local users ▼]                           │    │
│  │ Allow HTTP (no TLS): [✓] (Cockpit-style)              │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ZFS Delegation (zfs allow)                                   │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Dataset: tank/home                                    │    │
│  │ User: alice                                           │    │
│  │ Permissions: create, destroy, snapshot, mount, send   │    │
│  │ [Edit] [Revoke]                                       │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ARC Statistics                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ ARC Size: 8.2G / 16G max    Hit Rate: 94.2%          │    │
│  │ L2ARC Size: 120G            L2 Hit Rate: 78.1%       │    │
│  │ MRU: 5.1G   MFU: 3.1G                                │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Pool History / Audit Log                                     │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ 2026-02-10 14:32  zfs snapshot tank/home@daily-0210   │    │
│  │ 2026-02-10 02:00  zfs send -i @0209 @0210 | ssh...   │    │
│  │ 2026-02-08 00:00  zpool scrub tank                    │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Data sources:** `zfs allow <dataset>`, `/proc/spl/kstat/zfs/arcstats`, `zpool history`

---

## Part 4: Backend API Design

### Endpoint Structure

```
GET    /api/pools                        → zpool list -Hp -o all
GET    /api/pools/:pool                  → zpool status <pool> + zpool get all <pool>
POST   /api/pools                        → zpool create ...
DELETE /api/pools/:pool                  → zpool destroy <pool>
POST   /api/pools/:pool/scrub            → zpool scrub <pool>
POST   /api/pools/:pool/trim             → zpool trim <pool>
GET    /api/pools/:pool/iostat           → zpool iostat <pool> 1 (WebSocket)
GET    /api/pools/:pool/history          → zpool history <pool>
GET    /api/pools/:pool/events           → zpool events <pool>
POST   /api/pools/:pool/import           → zpool import <pool>
POST   /api/pools/:pool/export           → zpool export <pool>

GET    /api/pools/:pool/devices          → parsed from zpool status
POST   /api/pools/:pool/devices          → zpool add
DELETE /api/pools/:pool/devices/:dev     → zpool remove
POST   /api/pools/:pool/devices/:dev/replace → zpool replace
POST   /api/pools/:pool/devices/:dev/online  → zpool online
POST   /api/pools/:pool/devices/:dev/offline → zpool offline

GET    /api/datasets                     → zfs list -H -o ... -r -t all
GET    /api/datasets/:path               → zfs get all <path>
POST   /api/datasets                     → zfs create ...
DELETE /api/datasets/:path               → zfs destroy <path>
PATCH  /api/datasets/:path               → zfs set key=val <path>
POST   /api/datasets/:path/mount         → zfs mount
POST   /api/datasets/:path/unmount       → zfs unmount
POST   /api/datasets/:path/share         → zfs share
POST   /api/datasets/:path/unshare       → zfs unshare

GET    /api/datasets/:path/snapshots     → zfs list -H -t snapshot -r <path>
POST   /api/datasets/:path/snapshots     → zfs snapshot <path>@<name>
DELETE /api/snapshots/:snap              → zfs destroy <snap>
POST   /api/snapshots/:snap/rollback     → zfs rollback <snap>
POST   /api/snapshots/:snap/clone        → zfs clone <snap> <dest>
POST   /api/snapshots/:snap/hold         → zfs hold <tag> <snap>
DELETE /api/snapshots/:snap/hold/:tag    → zfs release <tag> <snap>
GET    /api/snapshots/:snap/diff/:other  → zfs diff <snap> <other>
POST   /api/snapshots/:snap/send         → zfs send ...
POST   /api/snapshots/:snap/bookmark     → zfs bookmark ...

POST   /api/datasets/:path/load-key     → zfs load-key
POST   /api/datasets/:path/unload-key   → zfs unload-key
POST   /api/datasets/:path/change-key   → zfs change-key

GET    /api/datasets/:path/permissions   → zfs allow <path>
POST   /api/datasets/:path/permissions   → zfs allow <user> <perms> <path>
DELETE /api/datasets/:path/permissions   → zfs unallow ...

GET    /api/datasets/:path/userspace     → zfs userspace <path>
GET    /api/datasets/:path/groupspace    → zfs groupspace <path>

GET    /api/system/arc                   → /proc/spl/kstat/zfs/arcstats
GET    /api/system/disks                 → lsblk / smartctl
GET    /api/system/version               → zfs version, zpool version

WS     /api/ws/iostat                    → streaming zpool iostat
WS     /api/ws/events                    → streaming zpool events -f
WS     /api/ws/send-progress             → progress during send/receive
```

### URL Encoding Strategy

ZFS names contain characters that are special in URLs:

| Character | Appears in | URL issue | Solution |
|---|---|---|---|
| `/` | Dataset paths (`tank/home/alice`) | Path separator | Use FastAPI `path` converter: `{name:path}` |
| `@` | Snapshot names (`dataset@snap`) | Technically safe, but percent-encode for clarity | `%40` in URL, or pass as separate path segments |
| `#` | Bookmark names (`dataset#bookmark`) | **Fragment identifier — silently dropped by browsers** | **Never use in URL path.** Pass bookmark name via query parameter: `?name=bookmarkname` |

**Frontend rule:** Always use `encodeURIComponent()` when embedding ZFS names in URL path segments. The API client should handle this transparently.

**Backend rule:** FastAPI automatically decodes percent-encoded path parameters. Use `{name:path}` for dataset paths that contain `/`.

---

## Part 5: Network & Security Model

### Cockpit-Aligned Approach

Following Cockpit's precedent for local/LAN server management:

| Scenario | Configuration |
|---|---|
| **Localhost only** | Bind `127.0.0.1:8080`, plain HTTP — no config needed |
| **LAN access, no TLS** | Bind `0.0.0.0:8080`, set `allow_unencrypted = true` — for trusted networks only |
| **LAN with TLS** | nginx/caddy reverse proxy with self-signed or Let's Encrypt cert → `localhost:8080` |
| **Remote/internet** | Reverse proxy with TLS + VPN or Tailscale/Wireguard required |

### Privilege Model

The backend runs as **root** because ZFS commands (`zfs`, `zpool`) require root privileges. This is the same approach Cockpit uses — its `cockpit-ws` process also runs as root.

**Why not sudo/polkit?**
- Running as a non-root user with `sudo` for each ZFS command adds latency and complexity (sudoers rules, PATH issues, environment sanitization)
- polkit integration is possible but significantly more work and not standard for ZFS tooling
- The Cockpit precedent demonstrates this is an acceptable trade-off for server management tools

**Mitigations:**
- Systemd hardening: `ProtectHome=read-only`, `ProtectSystem=strict`, `PrivateTmp=true`, restricted `ReadWritePaths`
- Backend binds to `127.0.0.1` by default — not network-accessible without reverse proxy
- All user input is validated against strict regex patterns before being passed to subprocess (see `backend/services/cmd.py`)
- Commands use array-based `subprocess` (not shell strings) — prevents shell injection
- `--` separator used before positional arguments — prevents flag injection
- Destructive operations require explicit confirmation tokens from the frontend

**Future consideration:** If privilege separation becomes necessary, the cleanest approach would be a Unix socket-based privileged helper that only accepts a whitelist of structured commands (not raw shell).

### Authentication Options (in order of complexity)

1. **PAM** — reuse system users (same as Cockpit), requires the backend run as root
2. **Local users + bcrypt** — app-managed user database, simpler but separate from system
3. **mTLS client certificates** — for advanced setups behind a reverse proxy

### Session Cookie Security

Session cookies must be set with these attributes:
- `HttpOnly=true` — prevents JavaScript access (mitigates XSS)
- `SameSite=Lax` — prevents CSRF for cross-site POST requests while allowing normal navigation
- `Secure=true` — only sent over HTTPS (when behind TLS reverse proxy)
- `Path=/api` — scoped to API routes only

### CSRF Protection

Since authentication uses session cookies, state-changing endpoints (POST, PUT, DELETE) are vulnerable to CSRF attacks. The `SameSite=Lax` cookie attribute prevents most CSRF vectors, but for defense in depth:

- All state-changing API requests must include a `X-Requested-With: XMLHttpRequest` header (or equivalent custom header)
- The backend validates this header is present on mutating requests
- Browsers do not allow cross-origin requests to set custom headers without CORS preflight, which provides CSRF protection
- This is the same pattern used by Django, Rails, and other frameworks as a lightweight CSRF defense

### Destructive Operation Safeguards

Every command marked **destructive** in the inventory should require:
- Confirmation dialog with the resource name typed to confirm
- Audit log entry before execution
- Hold check for snapshots (`zfs holds`)
- Dependency check for datasets (children, clones, mounts)
