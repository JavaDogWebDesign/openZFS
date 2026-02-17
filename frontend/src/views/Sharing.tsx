import { useCallback, useState } from "react";
import {
  listDatasets,
  getDatasetProperties,
  shareDataset,
  unshareDataset,
  type DatasetSummary,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import {
  Share2,
  Lock,
  Unlock,
  Key,
  RefreshCw,
  FolderOpen,
  Shield,
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

export function Sharing() {
  const [shareDetails, setShareDetails] = useState<ShareInfo[]>([]);
  const [encryptionDetails, setEncryptionDetails] = useState<EncryptionInfo[]>(
    [],
  );
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [shareProtocol, setShareProtocol] = useState<
    Record<string, "nfs" | "smb">
  >({});
  const [shareOptions, setShareOptions] = useState<Record<string, string>>({});
  const [newKeyDataset, setNewKeyDataset] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

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

  const handleShare = async (name: string) => {
    const protocol = shareProtocol[name] ?? "nfs";
    const options = shareOptions[name] ?? "";
    const result = await shareMutation.execute(name, protocol, options);
    if (result) {
      loadDetails();
    }
  };

  const handleUnshare = async (name: string) => {
    const result = await unshareMutation.execute(name);
    if (result) {
      loadDetails();
    }
  };

  const handleRefresh = () => {
    refetchDatasets();
    loadDetails();
  };

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
      {shareMutation.error && (
        <div className={s.error}>{shareMutation.error}</div>
      )}
      {unshareMutation.error && (
        <div className={s.error}>{unshareMutation.error}</div>
      )}

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
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Dataset
              </label>
              <select
                className={s.select}
                id="share-dataset-select"
                defaultValue=""
                onChange={(e) => {
                  const name = e.target.value;
                  if (name && !shareProtocol[name]) {
                    setShareProtocol((prev) => ({ ...prev, [name]: "nfs" }));
                  }
                }}
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
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Protocol
              </label>
              <select
                className={s.select}
                onChange={(e) => {
                  const el = document.getElementById(
                    "share-dataset-select",
                  ) as HTMLSelectElement | null;
                  const dsName = el?.value;
                  if (dsName) {
                    setShareProtocol((prev) => ({
                      ...prev,
                      [dsName]: e.target.value as "nfs" | "smb",
                    }));
                  }
                }}
              >
                <option value="nfs">NFS</option>
                <option value="smb">SMB</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Options
              </label>
              <input
                className={s.select}
                placeholder="e.g. rw,no_root_squash"
                onChange={(e) => {
                  const el = document.getElementById(
                    "share-dataset-select",
                  ) as HTMLSelectElement | null;
                  const dsName = el?.value;
                  if (dsName) {
                    setShareOptions((prev) => ({
                      ...prev,
                      [dsName]: e.target.value,
                    }));
                  }
                }}
              />
            </div>
            <button
              className={s.btnPrimary}
              onClick={() => {
                const el = document.getElementById(
                  "share-dataset-select",
                ) as HTMLSelectElement | null;
                const dsName = el?.value;
                if (dsName) handleShare(dsName);
              }}
              disabled={shareMutation.loading}
            >
              <Share2 size={14} />
              {shareMutation.loading ? "Sharing..." : "Share"}
            </button>
          </div>
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
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                  Actions
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
                  <td style={{ padding: "var(--space-3)" }}>
                    <div className={s.actions}>
                      {enc.keystatus === "available" ? (
                        <button className={s.btnGhost} title="Unload key">
                          <Lock size={14} /> Unload
                        </button>
                      ) : (
                        <button className={s.btnPrimary} title="Load key">
                          <Unlock size={14} /> Load
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Change Encryption Key */}
        {encryptionDetails.length > 0 && (
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
              <Key
                size={14}
                style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
              />
              Change Encryption Key
            </h3>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  Dataset
                </label>
                <select
                  className={s.select}
                  value={newKeyDataset}
                  onChange={(e) => setNewKeyDataset(e.target.value)}
                >
                  <option value="">Select dataset...</option>
                  {encryptionDetails.map((enc) => (
                    <option key={enc.dataset} value={enc.dataset}>
                      {enc.dataset}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  New Passphrase
                </label>
                <input
                  className={s.select}
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="Enter new passphrase"
                  style={{ minWidth: "250px" }}
                />
              </div>
              <button
                className={s.btnPrimary}
                disabled={!newKeyDataset || !newKeyValue}
                onClick={() => {
                  // Key change would use a dedicated API endpoint
                  setNewKeyValue("");
                }}
              >
                <Key size={14} /> Change Key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
