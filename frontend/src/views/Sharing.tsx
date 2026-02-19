import { useCallback, useState } from "react";
import {
  listDatasets,
  getDatasetProperties,
  shareDataset,
  unshareDataset,
  listSmbUsers,
  addSmbUser,
  removeSmbUser,
  changeSmbPassword,
  listSmbShares,
  updateShareAccess,
  type DatasetSummary,
  type SmbOptions as ApiSmbOptions,
  type SmbUser,
  type SmbShareInfo,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { useToast } from "@/components/Toast";
import {
  Share2,
  Lock,
  Unlock,
  RefreshCw,
  FolderOpen,
  Shield,
  Eye,
  Users,
  Info,
  ChevronDown,
  ChevronRight,
  Trash2,
  KeyRound,
} from "lucide-react";
import s from "@/styles/views.module.css";

interface ShareInfo {
  dataset: string;
  protocol: "nfs" | "smb";
  options: string;
  active: boolean;
}

interface EncryptionInfo {
  dataset: string;
  encryption: string;
  keystatus: string;
  keyformat: string;
  keylocation: string;
}

/* ---------- NFS/SMB option builders ---------- */

interface NfsOptions {
  hosts: string;
  permissions: "rw" | "ro";
  noRootSquash: boolean;
  sync: boolean;
  noSubtreeCheck: boolean;
}

interface SmbOptions {
  guestOk: boolean;
  readOnly: boolean;
  browseable: boolean;
  validUsers: string;
  writeList: string;
  createMask: string;
  directoryMask: string;
  forceUser: string;
  forceGroup: string;
  inheritPermissions: boolean;
  vfsObjects: string;
}

const DEFAULT_NFS: NfsOptions = {
  hosts: "*",
  permissions: "rw",
  noRootSquash: false,
  sync: true,
  noSubtreeCheck: true,
};

const DEFAULT_SMB: SmbOptions = {
  guestOk: false,
  readOnly: false,
  browseable: true,
  validUsers: "",
  writeList: "",
  createMask: "",
  directoryMask: "",
  forceUser: "",
  forceGroup: "",
  inheritPermissions: false,
  vfsObjects: "",
};

function buildNfsOptions(opts: NfsOptions): string {
  // ZFS sharenfs accepts comma-separated NFS options, NOT the
  // /etc/exports host(opts) format. Host access control is managed
  // separately in /etc/exports or /etc/exports.d/.
  const parts: string[] = [opts.permissions];
  if (opts.noRootSquash) parts.push("no_root_squash");
  if (opts.sync) parts.push("sync");
  else parts.push("async");
  if (opts.noSubtreeCheck) parts.push("no_subtree_check");
  return parts.join(",");
}

function buildSmbOptions(_opts: SmbOptions): string {
  // ZFS sharesmb property only accepts "on" or "off".
  // Samba-specific options (guest ok, browseable, etc.) must be
  // configured in /etc/samba/smb.conf, not via the ZFS property.
  return "on";
}

export function Sharing() {
  const [shareDetails, setShareDetails] = useState<ShareInfo[]>([]);
  const [encryptionDetails, setEncryptionDetails] = useState<EncryptionInfo[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // New share form — controlled state
  const [newShareDataset, setNewShareDataset] = useState("");
  const [newShareProtocol, setNewShareProtocol] = useState<"nfs" | "smb">("nfs");
  const [nfsOpts, setNfsOpts] = useState<NfsOptions>({ ...DEFAULT_NFS });
  const [smbOpts, setSmbOpts] = useState<SmbOptions>({ ...DEFAULT_SMB });

  // SMB Users state
  const [newSmbUsername, setNewSmbUsername] = useState("");
  const [newSmbPassword, setNewSmbPassword] = useState("");
  const [newSmbShares, setNewSmbShares] = useState<string[]>([]);
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState("");

  // Connection info toggle state
  const [expandedConnect, setExpandedConnect] = useState<string | null>(null);

  const { addToast } = useToast();

  const {
    data: datasets,
    loading: datasetsLoading,
    error: datasetsError,
    refetch: refetchDatasets,
  } = useApi(() => listDatasets(), []);

  const shareMutation = useMutation(
    (name: string, protocol: "nfs" | "smb", options: string, smbOptions?: ApiSmbOptions) =>
      shareDataset(name, protocol, options, smbOptions),
  );

  const unshareMutation = useMutation((name: string, protocol?: "nfs" | "smb") =>
    unshareDataset(name, protocol),
  );

  const {
    data: smbUsers,
    loading: smbUsersLoading,
    refetch: refetchSmbUsers,
  } = useApi(() => listSmbUsers(), []);

  const addSmbUserMutation = useMutation((username: string, password: string) =>
    addSmbUser(username, password),
  );
  const removeSmbUserMutation = useMutation((username: string) =>
    removeSmbUser(username),
  );
  const changeSmbPwMutation = useMutation((username: string, password: string) =>
    changeSmbPassword(username, password),
  );

  const {
    data: smbShares,
    refetch: refetchSmbShares,
  } = useApi(() => listSmbShares(), []);

  // Load detailed properties for all datasets
  const loadDetails = useCallback(async () => {
    if (!datasets?.length) return;
    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const shares: ShareInfo[] = [];
      const encryptions: EncryptionInfo[] = [];

      const results = await Promise.allSettled(
        datasets.map((ds: DatasetSummary) => getDatasetProperties(ds.name)),
      );

      results.forEach((result, idx) => {
        const ds = datasets[idx]!;
        if (result.status !== "fulfilled") return;
        const props = result.value;

        // Gather share info — a dataset can have both NFS and SMB active
        const sharenfs = props["sharenfs"]?.value ?? "off";
        const sharesmb = props["sharesmb"]?.value ?? "off";
        if (sharenfs !== "off" && sharenfs !== "-") {
          shares.push({
            dataset: ds.name,
            protocol: "nfs",
            options: sharenfs,
            active: true,
          });
        }
        if (sharesmb !== "off" && sharesmb !== "-") {
          shares.push({
            dataset: ds.name,
            protocol: "smb",
            options: sharesmb,
            active: true,
          });
        }

        // Gather encryption info
        const encryption = props["encryption"]?.value ?? "off";
        if (encryption !== "off" && encryption !== "-") {
          encryptions.push({
            dataset: ds.name,
            encryption,
            keystatus: props["keystatus"]?.value ?? "unknown",
            keyformat: props["keyformat"]?.value ?? "unknown",
            keylocation: props["keylocation"]?.value ?? "none",
          });
        }
      });

      setShareDetails(shares);
      setEncryptionDetails(encryptions);
    } catch (err) {
      setDetailsError(
        err instanceof Error ? err.message : "Failed to load details",
      );
    } finally {
      setDetailsLoading(false);
    }
  }, [datasets]);

  // Auto-load details once datasets are available
  useApi(
    () => {
      if (datasets?.length) {
        loadDetails();
      }
      return Promise.resolve(null);
    },
    [datasets],
  );

  const handleShare = async () => {
    if (!newShareDataset) return;
    const options =
      newShareProtocol === "nfs"
        ? buildNfsOptions(nfsOpts)
        : buildSmbOptions(smbOpts);
    const apiSmbOpts: ApiSmbOptions | undefined =
      newShareProtocol === "smb"
        ? {
            guest_ok: smbOpts.guestOk,
            browseable: smbOpts.browseable,
            read_only: smbOpts.readOnly,
            valid_users: smbOpts.validUsers,
            write_list: smbOpts.writeList,
            create_mask: smbOpts.createMask,
            directory_mask: smbOpts.directoryMask,
            force_user: smbOpts.forceUser,
            force_group: smbOpts.forceGroup,
            inherit_permissions: smbOpts.inheritPermissions,
            vfs_objects: smbOpts.vfsObjects,
          }
        : undefined;
    const result = await shareMutation.execute(newShareDataset, newShareProtocol, options, apiSmbOpts);
    if (result) {
      addToast("success", `Shared ${newShareDataset} via ${newShareProtocol.toUpperCase()}`);
      setNewShareDataset("");
      setNfsOpts({ ...DEFAULT_NFS });
      setSmbOpts({ ...DEFAULT_SMB });
      loadDetails();
    } else if (shareMutation.error) {
      addToast("error", shareMutation.error);
    }
  };

  const handleUnshare = async (name: string, protocol: "nfs" | "smb") => {
    const result = await unshareMutation.execute(name, protocol);
    if (result) {
      addToast("success", `Unshared ${name} (${protocol.toUpperCase()})`);
      loadDetails();
    } else if (unshareMutation.error) {
      addToast("error", unshareMutation.error);
    }
  };

  const handleRefresh = () => {
    refetchDatasets();
    loadDetails();
    refetchSmbUsers();
    refetchSmbShares();
  };

  const handleAddSmbUser = async () => {
    if (!newSmbUsername || !newSmbPassword) return;
    const result = await addSmbUserMutation.execute(newSmbUsername, newSmbPassword);
    if (result) {
      // Grant access to selected shares
      for (const shareName of newSmbShares) {
        const share = smbShares?.find((sh: SmbShareInfo) => sh.share_name === shareName);
        const existing = share?.valid_users ?? "";
        const users = existing ? existing.split(/\s+/) : [];
        if (!users.includes(newSmbUsername)) {
          users.push(newSmbUsername);
        }
        try {
          await updateShareAccess(shareName, users.join(" "));
        } catch {
          addToast("error", `Failed to grant access to share '${shareName}'`);
        }
      }
      addToast("success", `SMB user '${newSmbUsername}' added${newSmbShares.length ? ` with access to ${newSmbShares.length} share(s)` : ""}`);
      setNewSmbUsername("");
      setNewSmbPassword("");
      setNewSmbShares([]);
      refetchSmbUsers();
      refetchSmbShares();
    } else if (addSmbUserMutation.error) {
      addToast("error", addSmbUserMutation.error);
    }
  };

  const handleRemoveSmbUser = async (username: string) => {
    const result = await removeSmbUserMutation.execute(username);
    if (result) {
      addToast("success", `SMB user '${username}' removed`);
      refetchSmbUsers();
    } else if (removeSmbUserMutation.error) {
      addToast("error", removeSmbUserMutation.error);
    }
  };

  const handleChangeSmbPassword = async () => {
    if (!changePwUser || !changePwValue) return;
    const result = await changeSmbPwMutation.execute(changePwUser, changePwValue);
    if (result) {
      addToast("success", `Password changed for '${changePwUser}'`);
      setChangePwUser(null);
      setChangePwValue("");
    } else if (changeSmbPwMutation.error) {
      addToast("error", changeSmbPwMutation.error);
    }
  };

  // Computed preview string
  const previewOptions =
    newShareProtocol === "nfs"
      ? buildNfsOptions(nfsOpts)
      : buildSmbOptions(smbOpts);

  if (datasetsLoading) {
    return <div className={s.loading}>Loading sharing and encryption data...</div>;
  }

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Sharing & Encryption</h1>
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {datasetsError && <div className={s.error}>{datasetsError}</div>}
      {detailsError && <div className={s.error}>{detailsError}</div>}

      {/* NFS/SMB Sharing Section */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Share2
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          Network Shares
        </h2>

        {detailsLoading ? (
          <div className={s.loading}>Loading share details...</div>
        ) : shareDetails.length === 0 ? (
          <div className={s.empty}>
            <FolderOpen
              size={24}
              style={{ marginBottom: "var(--space-2)", opacity: 0.5 }}
            />
            <div>No datasets are currently shared via NFS or SMB.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Dataset
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Protocol
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Options
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Status
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Connect
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shareDetails.map((share) => {
                const shareKey = `${share.dataset}-${share.protocol}`;
                const hostname = window.location.hostname;
                const shareName = share.dataset.replace(/\//g, "_");
                const mountpoint = `/${share.dataset}`;
                const isExpanded = expandedConnect === shareKey;
                return (
                  <>
                    <tr
                      key={shareKey}
                      style={{
                        borderBottom: isExpanded ? "none" : "1px solid var(--color-border)",
                      }}
                    >
                      <td
                        className={s.mono}
                        style={{ padding: "var(--space-3)" }}
                      >
                        {share.dataset}
                      </td>
                      <td style={{ padding: "var(--space-3)" }}>
                        <span className={s.badgeMuted}>
                          {share.protocol.toUpperCase()}
                        </span>
                      </td>
                      <td
                        className={s.mono}
                        style={{
                          padding: "var(--space-3)",
                          maxWidth: "300px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {share.options}
                      </td>
                      <td style={{ padding: "var(--space-3)" }}>
                        {share.active ? (
                          <span className={s.badgeSuccess}>Active</span>
                        ) : (
                          <span className={s.badgeWarning}>Inactive</span>
                        )}
                      </td>
                      <td style={{ padding: "var(--space-3)" }}>
                        <button
                          className={s.btnGhost}
                          onClick={() => setExpandedConnect(isExpanded ? null : shareKey)}
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Info size={14} />
                        </button>
                      </td>
                      <td style={{ padding: "var(--space-3)" }}>
                        <button
                          className={s.btnDanger}
                          onClick={() => handleUnshare(share.dataset, share.protocol)}
                          disabled={unshareMutation.loading}
                        >
                          {unshareMutation.loading ? "..." : "Unshare"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${shareKey}-connect`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td colSpan={6} style={{ padding: "0 var(--space-3) var(--space-3)" }}>
                          <div
                            style={{
                              background: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "var(--radius-sm)",
                              padding: "var(--space-3)",
                              fontSize: "var(--text-xs)",
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Connection Instructions</div>
                            {share.protocol === "smb" ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                <div>
                                  <strong>macOS:</strong> Finder → Go → Connect to Server →{" "}
                                  <code className={s.mono}>smb://{hostname}/{shareName}</code>
                                </div>
                                <div>
                                  <strong>Windows:</strong> File Explorer address bar →{" "}
                                  <code className={s.mono}>\\{hostname}\{shareName}</code>
                                </div>
                                <div>
                                  <strong>Linux:</strong> File manager →{" "}
                                  <code className={s.mono}>smb://{hostname}/{shareName}</code>
                                  <br />
                                  or: <code className={s.mono}>sudo mount -t cifs //{hostname}/{shareName} /mnt/point -o username=&lt;user&gt;</code>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                <div>
                                  <strong>Linux:</strong>{" "}
                                  <code className={s.mono}>sudo mount -t nfs {hostname}:{mountpoint} /mnt/point</code>
                                </div>
                                <div>
                                  <strong>macOS:</strong>{" "}
                                  <code className={s.mono}>sudo mount -t nfs {hostname}:{mountpoint} /mnt/point</code>
                                </div>
                                <div>
                                  <strong>Windows:</strong>{" "}
                                  <code className={s.mono}>mount \\{hostname}\{mountpoint} Z:</code>
                                  <span style={{ color: "var(--color-text-dim)", marginLeft: "var(--space-2)" }}>(requires NFS client feature)</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Share a new dataset */}
        <div
          style={{
            marginTop: "var(--space-4)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <h3
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              marginBottom: "var(--space-3)",
            }}
          >
            Share a Dataset
          </h3>

          {shareMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-3)" }}>{shareMutation.error}</div>
          )}

          {/* Row 1: Dataset + Protocol */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              marginBottom: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 250px" }}>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Dataset
              </label>
              <select
                className={s.select}
                style={{ width: "100%" }}
                value={newShareDataset}
                onChange={(e) => setNewShareDataset(e.target.value)}
              >
                <option value="">Select dataset...</option>
                {datasets
                  ?.map((ds: DatasetSummary) => {
                    const alreadyShared = shareDetails.some(
                      (sh) => sh.dataset === ds.name && sh.protocol === newShareProtocol,
                    );
                    return (
                      <option key={ds.name} value={ds.name}>
                        {ds.name}{alreadyShared ? " (already shared)" : ""}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div style={{ flex: "0 0 120px" }}>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Protocol
              </label>
              <select
                className={s.select}
                style={{ width: "100%" }}
                value={newShareProtocol}
                onChange={(e) => setNewShareProtocol(e.target.value as "nfs" | "smb")}
              >
                <option value="nfs">NFS</option>
                <option value="smb">SMB</option>
              </select>
            </div>
          </div>

          {/* Row 2: Protocol-specific options */}
          {newShareProtocol === "nfs" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div>
                <div
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Host access control (which IPs can connect) is configured
                  in <code>/etc/exports</code> on the server, not via ZFS properties.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Permissions
                </label>
                <select
                  className={s.select}
                  style={{ width: "100%" }}
                  value={nfsOpts.permissions}
                  onChange={(e) =>
                    setNfsOpts((o) => ({ ...o, permissions: e.target.value as "rw" | "ro" }))
                  }
                >
                  <option value="rw">Read/Write</option>
                  <option value="ro">Read Only</option>
                </select>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Read/Write allows clients to modify files. Read Only limits clients to viewing files only.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={nfsOpts.noRootSquash}
                    onChange={(e) => setNfsOpts((o) => ({ ...o, noRootSquash: e.target.checked }))}
                  />
                  no_root_squash
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  By default, NFS maps remote root users to an unprivileged user (nobody) for security. Enable this to let remote root users retain full root privileges on the share. Use with caution.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={nfsOpts.sync}
                    onChange={(e) => setNfsOpts((o) => ({ ...o, sync: e.target.checked }))}
                  />
                  Synchronous writes
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Sync mode writes data to disk before acknowledging the client, ensuring data safety at the cost of performance. Async mode is faster but risks data loss on server crash.
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer", marginTop: "var(--space-1)" }}>
                  <input
                    type="checkbox"
                    checked={nfsOpts.noSubtreeCheck}
                    onChange={(e) => setNfsOpts((o) => ({ ...o, noSubtreeCheck: e.target.checked }))}
                  />
                  no_subtree_check
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Disables checking that accessed files are within the exported directory tree. Improves reliability when files are renamed while a client has them open. Recommended for most ZFS shares.
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
                marginBottom: "var(--space-3)",
              }}
            >
              {/* Row 1: Checkboxes */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.guestOk}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, guestOk: e.target.checked }))}
                  />
                  Guest access
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Allow access without a password. Useful for public shares on trusted networks.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.browseable}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, browseable: e.target.checked }))}
                  />
                  Browseable
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Make the share visible when browsing the network. Disable to create a hidden share.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.readOnly}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, readOnly: e.target.checked }))}
                  />
                  Read only
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Prevent clients from modifying files on this share.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.inheritPermissions}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, inheritPermissions: e.target.checked }))}
                  />
                  Inherit permissions
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  New files/directories inherit permissions from their parent directory.
                </div>
              </div>

              {/* Row 2: Text inputs */}
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Valid users
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="alice bob @staff"
                  value={smbOpts.validUsers}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, validUsers: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Space-separated users/groups (prefix groups with @). Leave empty for no restriction.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Write list
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="alice @admins"
                  value={smbOpts.writeList}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, writeList: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Users/groups with write access even if share is read-only.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Create mask
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="0644"
                  value={smbOpts.createMask}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, createMask: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Octal permissions for newly created files.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Directory mask
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="0755"
                  value={smbOpts.directoryMask}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, directoryMask: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Octal permissions for newly created directories.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Force user
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="nobody"
                  value={smbOpts.forceUser}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, forceUser: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  All file operations use this system user regardless of client identity.
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Force group
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="nogroup"
                  value={smbOpts.forceGroup}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, forceGroup: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  All file operations use this group regardless of client identity.
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  VFS objects
                </label>
                <input
                  className={s.input}
                  style={{ width: "100%" }}
                  placeholder="recycle shadow_copy2"
                  value={smbOpts.vfsObjects}
                  onChange={(e) => setSmbOpts((o) => ({ ...o, vfsObjects: e.target.value }))}
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Space-separated VFS modules. Common: <code>recycle</code> (recycle bin), <code>shadow_copy2</code> (Previous Versions from ZFS snapshots).
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  SMB config is written to <code>/etc/samba/zfs-manager-shares.conf</code> and
                  included automatically in <code>smb.conf</code>.
                </div>
              </div>
            </div>
          )}

          {/* Preview box */}
          {newShareDataset && (
            <div
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-2) var(--space-3)",
                marginBottom: "var(--space-3)",
                display: "flex",
                alignItems: newShareProtocol === "smb" ? "flex-start" : "center",
                gap: "var(--space-2)",
              }}
            >
              <Eye size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0, marginTop: newShareProtocol === "smb" ? 2 : 0 }} />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", flexShrink: 0 }}>Preview:</span>
              {newShareProtocol === "smb" ? (
                <pre className={s.mono} style={{ fontSize: "var(--text-xs)", margin: 0, whiteSpace: "pre" }}>
{[
  `[${newShareDataset.replace("/", "_")}]`,
  `  path = /${newShareDataset}`,
  `  guest ok = ${smbOpts.guestOk ? "yes" : "no"}`,
  `  browseable = ${smbOpts.browseable ? "yes" : "no"}`,
  `  read only = ${smbOpts.readOnly ? "yes" : "no"}`,
  smbOpts.validUsers ? `  valid users = ${smbOpts.validUsers}` : "",
  smbOpts.writeList ? `  write list = ${smbOpts.writeList}` : "",
  smbOpts.createMask ? `  create mask = ${smbOpts.createMask}` : "",
  smbOpts.directoryMask ? `  directory mask = ${smbOpts.directoryMask}` : "",
  smbOpts.forceUser ? `  force user = ${smbOpts.forceUser}` : "",
  smbOpts.forceGroup ? `  force group = ${smbOpts.forceGroup}` : "",
  smbOpts.inheritPermissions ? "  inherit permissions = yes" : "",
  smbOpts.vfsObjects ? `  vfs objects = ${smbOpts.vfsObjects}` : "",
].filter(Boolean).join("\n")}
                </pre>
              ) : (
                <code className={s.mono} style={{ fontSize: "var(--text-sm)" }}>
                  {previewOptions}
                </code>
              )}
            </div>
          )}

          {/* Share button */}
          <button
            className={s.btnPrimary}
            onClick={handleShare}
            disabled={shareMutation.loading || !newShareDataset}
          >
            <Share2 size={14} />
            {shareMutation.loading ? "Sharing..." : "Share"}
          </button>
        </div>
      </div>

      {/* SMB Users Section */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Users
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          SMB Users
        </h2>

        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-3)",
          }}
        >
          Samba maintains its own user database separate from system (PAM) users.
          Users must exist as system users before they can be added as SMB users.
        </div>

        {smbUsersLoading ? (
          <div className={s.loading}>Loading SMB users...</div>
        ) : !smbUsers || smbUsers.length === 0 ? (
          <div className={s.empty}>
            <Users size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No Samba users configured.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--space-3)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Username
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Full Name
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {smbUsers.map((u: SmbUser) => (
                <tr key={u.username} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={s.mono} style={{ padding: "var(--space-3)" }}>
                    {u.username}
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    {u.full_name || <span style={{ color: "var(--color-text-dim)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                      {changePwUser === u.username ? (
                        <>
                          <input
                            className={s.input}
                            type="password"
                            placeholder="New password"
                            value={changePwValue}
                            onChange={(e) => setChangePwValue(e.target.value)}
                            style={{ width: 160 }}
                          />
                          <button
                            className={s.btnPrimary}
                            onClick={handleChangeSmbPassword}
                            disabled={changeSmbPwMutation.loading || !changePwValue}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            {changeSmbPwMutation.loading ? "..." : "Save"}
                          </button>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setChangePwUser(null); setChangePwValue(""); }}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setChangePwUser(u.username); setChangePwValue(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <KeyRound size={12} /> Password
                          </button>
                          <button
                            className={s.btnDanger}
                            onClick={() => handleRemoveSmbUser(u.username)}
                            disabled={removeSmbUserMutation.loading}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Trash2 size={12} /> {removeSmbUserMutation.loading ? "..." : "Remove"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add SMB User form */}
        <div
          style={{
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Add SMB User
          </h3>
          {addSmbUserMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{addSmbUserMutation.error}</div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Username
              </label>
              <input
                className={s.input}
                placeholder="System username"
                value={newSmbUsername}
                onChange={(e) => setNewSmbUsername(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Password
              </label>
              <input
                className={s.input}
                type="password"
                placeholder="SMB password"
                value={newSmbPassword}
                onChange={(e) => setNewSmbPassword(e.target.value)}
              />
            </div>
            <button
              className={s.btnPrimary}
              onClick={handleAddSmbUser}
              disabled={addSmbUserMutation.loading || !newSmbUsername || !newSmbPassword}
            >
              {addSmbUserMutation.loading ? "Adding..." : "Add User"}
            </button>
          </div>
          {smbShares && smbShares.length > 0 && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Grant access to shares
              </label>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                {smbShares.map((share: SmbShareInfo) => (
                  <label
                    key={share.share_name}
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={newSmbShares.includes(share.share_name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewSmbShares((prev) => [...prev, share.share_name]);
                        } else {
                          setNewSmbShares((prev) => prev.filter((n) => n !== share.share_name));
                        }
                      }}
                    />
                    <span className={s.mono}>{share.share_name}</span>
                    <span style={{ color: "var(--color-text-dim)", fontSize: "var(--text-xs)" }}>({share.path})</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: "var(--space-1)" }}>
                Leave unchecked to add the user without granting access to any specific share.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Encryption Section */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Shield
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          Dataset Encryption
        </h2>

        {detailsLoading ? (
          <div className={s.loading}>Loading encryption details...</div>
        ) : encryptionDetails.length === 0 ? (
          <div className={s.empty}>
            <Lock
              size={24}
              style={{ marginBottom: "var(--space-2)", opacity: 0.5 }}
            />
            <div>No encrypted datasets found.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Dataset
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Encryption
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Key Status
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Key Format
                </th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Key Location
                </th>
              </tr>
            </thead>
            <tbody>
              {encryptionDetails.map((enc) => (
                <tr
                  key={enc.dataset}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <td
                    className={s.mono}
                    style={{ padding: "var(--space-3)" }}
                  >
                    {enc.dataset}
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    <span className={s.badgeMuted}>{enc.encryption}</span>
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    {enc.keystatus === "available" ? (
                      <span className={s.badgeSuccess}>
                        <Unlock size={10} style={{ marginRight: "4px" }} />
                        Available
                      </span>
                    ) : (
                      <span className={s.badgeDanger}>
                        <Lock size={10} style={{ marginRight: "4px" }} />
                        Unavailable
                      </span>
                    )}
                  </td>
                  <td
                    className={s.mono}
                    style={{ padding: "var(--space-3)" }}
                  >
                    {enc.keyformat}
                  </td>
                  <td
                    className={s.mono}
                    style={{
                      padding: "var(--space-3)",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {enc.keylocation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      </div>
    </div>
  );
}
