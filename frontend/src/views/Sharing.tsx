import { useCallback, useState } from "react";
import {
  listDatasets,
  getDatasetProperties,
  shareDataset,
  unshareDataset,
  type DatasetSummary,
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
} from "lucide-react";
import s from "@/styles/views.module.css";

interface ShareInfo {
  dataset: string;
  protocol: "nfs" | "smb" | "none";
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
};

function buildNfsOptions(opts: NfsOptions): string {
  const parts: string[] = [opts.permissions];
  if (opts.noRootSquash) parts.push("no_root_squash");
  if (opts.sync) parts.push("sync");
  else parts.push("async");
  if (opts.noSubtreeCheck) parts.push("no_subtree_check");
  return `${opts.hosts}(${parts.join(",")})`;
}

function buildSmbOptions(opts: SmbOptions): string {
  const parts: string[] = [];
  if (opts.guestOk) parts.push("guest_ok=yes");
  if (opts.readOnly) parts.push("read only=yes");
  if (opts.browseable) parts.push("browseable=yes");
  else parts.push("browseable=no");
  return parts.length > 0 ? parts.join(",") : "on";
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

  const { addToast } = useToast();

  const {
    data: datasets,
    loading: datasetsLoading,
    error: datasetsError,
    refetch: refetchDatasets,
  } = useApi(() => listDatasets(), []);

  const shareMutation = useMutation(
    (name: string, protocol: "nfs" | "smb", options: string) =>
      shareDataset(name, protocol, options),
  );

  const unshareMutation = useMutation((name: string) =>
    unshareDataset(name),
  );

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

        // Gather share info
        const sharenfs = props["sharenfs"]?.value ?? "off";
        const sharesmb = props["sharesmb"]?.value ?? "off";
        if (sharenfs !== "off" && sharenfs !== "-") {
          shares.push({
            dataset: ds.name,
            protocol: "nfs",
            options: sharenfs,
            active: true,
          });
        } else if (sharesmb !== "off" && sharesmb !== "-") {
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
    const result = await shareMutation.execute(newShareDataset, newShareProtocol, options);
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

  const handleUnshare = async (name: string) => {
    const result = await unshareMutation.execute(name);
    if (result) {
      addToast("success", `Unshared ${name}`);
      loadDetails();
    } else if (unshareMutation.error) {
      addToast("error", unshareMutation.error);
    }
  };

  const handleRefresh = () => {
    refetchDatasets();
    loadDetails();
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shareDetails.map((share) => (
                <tr
                  key={share.dataset}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
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
                      className={s.btnDanger}
                      onClick={() => handleUnshare(share.dataset)}
                      disabled={unshareMutation.loading}
                    >
                      {unshareMutation.loading ? "..." : "Unshare"}
                    </button>
                  </td>
                </tr>
              ))}
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
                  ?.filter(
                    (ds: DatasetSummary) =>
                      !shareDetails.some((sh) => sh.dataset === ds.name),
                  )
                  .map((ds: DatasetSummary) => (
                    <option key={ds.name} value={ds.name}>
                      {ds.name}
                    </option>
                  ))}
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
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Access Hosts
                </label>
                <input
                  className={s.select}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={nfsOpts.hosts}
                  onChange={(e) => setNfsOpts((o) => ({ ...o, hosts: e.target.value }))}
                  placeholder="* (all hosts)"
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Which clients can access this share. Use * for all hosts, a specific IP (192.168.1.10), or a subnet (10.0.0.0/24).
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
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--space-4)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.guestOk}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, guestOk: e.target.checked }))}
                  />
                  Guest Access
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: "var(--space-1)" }}>
                  Allow access without a username or password. Useful for open file drops or media shares on a trusted network.
                </div>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.readOnly}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, readOnly: e.target.checked }))}
                  />
                  Read Only
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: "var(--space-1)" }}>
                  Prevent all clients from creating, modifying, or deleting files on this share. Clients can only view and copy files.
                </div>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smbOpts.browseable}
                    onChange={(e) => setSmbOpts((o) => ({ ...o, browseable: e.target.checked }))}
                  />
                  Browseable
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: "var(--space-1)" }}>
                  Make this share visible when browsing the network (e.g. in Windows File Explorer). Hidden shares can still be accessed by typing the full path.
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
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Eye size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Preview:</span>
              <code className={s.mono} style={{ fontSize: "var(--text-sm)" }}>
                {previewOptions}
              </code>
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
