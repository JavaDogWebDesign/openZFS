# ZFS CLI Quick Reference for Backend Implementation

Machine-parseable flags to always use: `-H` (no header), `-p` (parseable/raw numbers), `-o` (select columns).

## Reading Data

```bash
# List all pools
zpool list -Hp -o name,size,alloc,free,fragmentation,capacity,health,altroot

# Pool detailed status (no machine-parseable mode — must parse)
zpool status <pool>

# Pool properties
zpool get all <pool> -Hp

# Pool I/O stats (streaming, 1-sec interval)
zpool iostat <pool> 1 -Hp

# Pool events (streaming)
zpool events -f -H

# Pool history
zpool history <pool>

# List datasets
zfs list -Hp -o name,used,avail,refer,mountpoint,compression,encryption,keystatus,mounted -r -t filesystem,volume <pool>

# List snapshots
zfs list -Hp -o name,used,refer,creation -r -t snapshot <pool_or_dataset>

# List bookmarks
zfs list -Hp -o name,creation -r -t bookmark <pool_or_dataset>

# Dataset properties
zfs get all <dataset> -Hp

# Snapshot diff
zfs diff <snap1> <snap2>

# Snapshot holds
zfs holds <snapshot>

# User/group/project space
zfs userspace -Hp <dataset>
zfs groupspace -Hp <dataset>
zfs projectspace -Hp <dataset>

# Delegated permissions
zfs allow <dataset>

# ARC stats (not a ZFS command — read from proc)
cat /proc/spl/kstat/zfs/arcstats

# Available disks (for pool creation wizard)
lsblk -Jbp -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL
```

## Pool Operations

```bash
# Create pool
zpool create [-f] [-o property=value] [-O property=value] [-m mountpoint] <pool> <vdev_spec>
# vdev_spec examples: mirror sda sdb | raidz sda sdb sdc | raidz2 sda sdb sdc sdd

# Add vdevs
zpool add [-f] <pool> <vdev_spec>

# Add mirror to existing device
zpool attach <pool> <existing_dev> <new_dev>

# Remove mirror device
zpool detach <pool> <device>

# Replace device
zpool replace <pool> <old_dev> [new_dev]

# Remove vdev
zpool remove <pool> <vdev>

# Import/export
zpool import                          # list importable pools
zpool import [-f] <pool_or_id>
zpool export <pool>

# Destroy
zpool destroy [-f] <pool>

# Scrub
zpool scrub <pool>                    # start
zpool scrub -p <pool>                 # pause
zpool scrub -s <pool>                 # stop

# TRIM
zpool trim <pool>
zpool trim -s <pool>                  # stop

# Device state
zpool online <pool> <device>
zpool offline [-t] <pool> <device>    # -t = temporary (until reboot)

# Clear errors
zpool clear <pool> [device]

# Checkpoint
zpool checkpoint <pool>
zpool checkpoint -d <pool>            # discard checkpoint

# Properties
zpool set <property>=<value> <pool>

# Upgrade
zpool upgrade <pool>

# Misc
zpool initialize <pool> [device]
zpool reopen <pool>
zpool reguid <pool>
zpool sync <pool>
zpool labelclear [-f] <device>
```

## Dataset Operations

```bash
# Create filesystem
zfs create [-o property=value] <dataset>

# Create volume (zvol)
zfs create -V <size> [-o property=value] <dataset>

# Destroy
zfs destroy [-r] [-R] [-f] <dataset>   # -r=recursive, -R=dependents, -f=force unmount

# Rename
zfs rename <old> <new>

# Set/inherit properties
zfs set <property>=<value> <dataset>
zfs inherit [-r] <property> <dataset>

# Mount/unmount
zfs mount <dataset>
zfs unmount <dataset>
zfs mount -a
zfs unmount -a

# Share
zfs set sharenfs="<options>" <dataset>
zfs set sharesmb="<options>" <dataset>
zfs share <dataset>
zfs unshare <dataset>

# Permissions delegation
zfs allow <user|group> <permissions> <dataset>
zfs unallow <user|group> <permissions> <dataset>
```

## Snapshot Operations

```bash
# Create
zfs snapshot [-r] <dataset>@<name>

# Destroy
zfs destroy <dataset>@<name>

# Rollback (destroys intermediate snapshots unless -r)
zfs rollback [-r] [-R] [-f] <dataset>@<name>

# Clone
zfs clone <dataset>@<snap> <new_dataset>

# Promote clone
zfs promote <clone_dataset>

# Holds
zfs hold <tag> <snapshot>
zfs release <tag> <snapshot>

# Bookmark
zfs bookmark <snapshot> <dataset>#<bookmark>
```

## Replication (Send/Receive)

```bash
# Full send
zfs send <dataset>@<snap>

# Incremental send
zfs send -i <snap1> <dataset>@<snap2>

# Incremental from bookmark
zfs send -i <dataset>#<bookmark> <dataset>@<snap>

# Raw (encrypted) send
zfs send -w <dataset>@<snap>

# Compressed send
zfs send -c <dataset>@<snap>

# Receive
zfs receive [-F] [-s] <dataset>        # -F=force rollback, -s=resumable

# Resume interrupted receive
zfs send -t <resume_token> | zfs receive <dataset>

# Remote replication pattern
zfs send -i @snap1 pool/data@snap2 | ssh remote zfs receive pool/data

# Verbose send (shows progress — parse for WebSocket)
zfs send -v -i @snap1 pool/data@snap2
```

## Encryption

```bash
# Create encrypted dataset
zfs create -o encryption=aes-256-gcm -o keyformat=passphrase <dataset>

# Load/unload key
zfs load-key <dataset>
zfs unload-key <dataset>

# Change key
zfs change-key <dataset>
zfs change-key -o keyformat=raw -o keylocation=file:///path <dataset>
```

## Output Parsing Notes

- `-H` replaces pretty formatting with TAB-delimited, no header
- `-p` outputs raw numbers (bytes, seconds since epoch) instead of human-readable
- `-o` selects columns: `-o name,used,avail`
- `zpool status` has NO machine-parseable mode — build a state-machine parser
- `zfs diff` outputs: `M` modified, `+` added, `-` removed, `R` renamed
- `zfs send -v` outputs progress lines to stderr: `HH:MM:SS  <bytes>  <dataset>`
- All sizes from `-p` are in bytes, all times are Unix epoch seconds
