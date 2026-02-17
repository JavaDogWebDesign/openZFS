import { FormEvent, useCallback, useMemo, useState } from "react";
import {
  Database,
  FolderOpen,
  FolderClosed,
  HardDrive,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import {
  listDatasets,
  listPools,
  getDatasetProperties,
  createDataset,
  destroyDataset,
  mountDataset,
  unmountDataset,
  shareDataset,
  type DatasetSummary,
  type PoolSummary,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import styles from "@/styles/views.module.css";

interface DatasetProperties {
  [key: string]: { value: string; source: string };
}

interface CreateForm {
  name: string;
  compression: string;
  quota: string;
  reservation: string;
  mountpoint: string;
}

const EMPTY_CREATE_FORM: CreateForm = {
  name: "",
  compression: "",
  quota: "",
  reservation: "",
  mountpoint: "",
};

const DISPLAY_PROPS = [
  "type",
  "creation",
  "used",
  "available",
  "referenced",
  "compressratio",
  "compression",
  "mountpoint",
  "mounted",
  "quota",
  "reservation",
  "recordsize",
  "atime",
  "relatime",
  "checksum",
  "dedup",
  "sharenfs",
  "sharesmb",
  "readonly",
  "canmount",
  "snapdir",
  "primarycache",
  "secondarycache",
] as const;

function getDepth(name: string): number {
  return (name.match(/\//g) || []).length;
}

export function Datasets() {
  const [poolFilter, setPoolFilter] = useState<string>("");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [destroyTarget, setDestroyTarget] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const [shareProtocol, setShareProtocol] = useState<"nfs" | "smb">("nfs");

  // --- Data fetching ---

  const {
    data: pools,
    loading: poolsLoading,
  } = useApi<PoolSummary[]>(() => listPools(), []);

  const {
    data: datasets,
    loading: datasetsLoading,
    error: datasetsError,
    refetch: refetchDatasets,
  } = useApi<DatasetSummary[]>(
    () => listDatasets(poolFilter || undefined),
    [poolFilter],
  );

  const {
    data: properties,
    loading: propsLoading,
    error: propsError,
    refetch: refetchProps,
  } = useApi<DatasetProperties>(
    () =>
      selectedDataset
        ? getDatasetProperties(selectedDataset)
        : Promise.resolve(null as unknown as DatasetProperties),
    [selectedDataset],
  );

  // --- Mutations ---

  const createMut = useMutation(
    (form: CreateForm) => {
      const props: Record<string, string> = {};
      if (form.compression) props.compression = form.compression;
      if (form.quota) props.quota = form.quota;
      if (form.reservation) props.reservation = form.reservation;
      if (form.mountpoint) props.mountpoint = form.mountpoint;
      return createDataset({
        name: form.name,
        properties: Object.keys(props).length > 0 ? props : undefined,
      });
    },
  );

  const destroyMut = useMutation(
    (name: string) => destroyDataset(name, name, false, false),
  );

  const mountMut = useMutation((name: string) => mountDataset(name));
  const unmountMut = useMutation((name: string) => unmountDataset(name));
  const shareMut = useMutation(
    (name: string, protocol: "nfs" | "smb") => shareDataset(name, protocol),
  );

  const { addToast } = useToast();

  // --- Derived ---

  const selectedSummary = useMemo(
    () => datasets?.find((d) => d.name === selectedDataset) ?? null,
    [datasets, selectedDataset],
  );

  const isMounted = useMemo(() => {
    if (!properties) return false;
    return properties.mounted?.value === "yes";
  }, [properties]);

  // --- Handlers ---

  const handleRowClick = useCallback((name: string) => {
    setSelectedDataset((prev) => (prev === name ? null : name));
  }, []);

  const handleCreateSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!createForm.name) return;
      const result = await createMut.execute(createForm);
      if (result) {
        addToast("success", `Dataset ${createForm.name} created`);
        setShowCreateModal(false);
        setCreateForm(EMPTY_CREATE_FORM);
        refetchDatasets();
      }
    },
    [createForm, createMut, refetchDatasets],
  );

  const handleDestroy = useCallback(async () => {
    if (!destroyTarget) return;
    const result = await destroyMut.execute(destroyTarget);
    if (result) {
      addToast("success", `Dataset ${destroyTarget} destroyed`);
      setDestroyTarget(null);
      if (selectedDataset === destroyTarget) {
        setSelectedDataset(null);
      }
      refetchDatasets();
    }
  }, [destroyTarget, destroyMut, selectedDataset, refetchDatasets, addToast]);

  const handleMount = useCallback(async () => {
    if (!selectedDataset) return;
    const result = await mountMut.execute(selectedDataset);
    if (result) {
      refetchProps();
      refetchDatasets();
    }
  }, [selectedDataset, mountMut, refetchProps, refetchDatasets]);

  const handleUnmount = useCallback(async () => {
    if (!selectedDataset) return;
    const result = await unmountMut.execute(selectedDataset);
    if (result) {
      refetchProps();
      refetchDatasets();
    }
  }, [selectedDataset, unmountMut, refetchProps, refetchDatasets]);

  const handleShare = useCallback(async () => {
    if (!shareTarget) return;
    const result = await shareMut.execute(shareTarget, shareProtocol);
    if (result) {
      setShareTarget(null);
      refetchProps();
    }
  }, [shareTarget, shareProtocol, shareMut, refetchProps]);

  // --- Render helpers ---

  const renderCreateModal = () => {
    if (!showCreateModal) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}
        onClick={() => setShowCreateModal(false)}
      >
        <div
          className={styles.card}
          style={{ width: 480, margin: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-4)",
            }}
          >
            <div className={styles.cardTitle}>Create Dataset</div>
            <button
              className={styles.btnGhost}
              onClick={() => setShowCreateModal(false)}
              style={{ padding: "var(--space-1)" }}
            >
              <X size={16} />
            </button>
          </div>

          {createMut.error && (
            <div className={styles.error}>{createMut.error}</div>
          )}

          <form onSubmit={handleCreateSubmit}>
            <div style={{ marginBottom: "var(--space-3)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  marginBottom: "var(--space-1)",
                }}
              >
                Dataset Name *
              </label>
              <input
                className={styles.select}
                style={{ width: "100%", boxSizing: "border-box" }}
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="pool/dataset"
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "var(--space-3)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  marginBottom: "var(--space-1)",
                }}
              >
                Compression
              </label>
              <select
                className={styles.select}
                style={{ width: "100%" }}
                value={createForm.compression}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, compression: e.target.value }))
                }
              >
                <option value="">Inherit</option>
                <option value="on">on</option>
                <option value="off">off</option>
                <option value="lz4">lz4</option>
                <option value="gzip">gzip</option>
                <option value="zstd">zstd</option>
                <option value="lzjb">lzjb</option>
                <option value="zle">zle</option>
              </select>
            </div>

            <div className={styles.grid2}>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    marginBottom: "var(--space-1)",
                  }}
                >
                  Quota
                </label>
                <input
                  className={styles.select}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={createForm.quota}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, quota: e.target.value }))
                  }
                  placeholder="e.g. 10G"
                />
              </div>

              <div style={{ marginBottom: "var(--space-3)" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    marginBottom: "var(--space-1)",
                  }}
                >
                  Reservation
                </label>
                <input
                  className={styles.select}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={createForm.reservation}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      reservation: e.target.value,
                    }))
                  }
                  placeholder="e.g. 5G"
                />
              </div>
            </div>

            <div style={{ marginBottom: "var(--space-4)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  marginBottom: "var(--space-1)",
                }}
              >
                Mountpoint
              </label>
              <input
                className={styles.select}
                style={{ width: "100%", boxSizing: "border-box" }}
                value={createForm.mountpoint}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, mountpoint: e.target.value }))
                }
                placeholder="/mnt/data (optional)"
              />
            </div>

            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setShowCreateModal(false)}
                disabled={createMut.loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={createMut.loading || !createForm.name}
              >
                {createMut.loading ? "Creating..." : "Create Dataset"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderShareModal = () => {
    if (!shareTarget) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}
        onClick={() => setShareTarget(null)}
      >
        <div
          className={styles.card}
          style={{ width: 380, margin: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.cardTitle}>Share Dataset</div>
          <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            Share <span className={styles.mono}>{shareTarget}</span> via:
          </p>

          {shareMut.error && (
            <div className={styles.error}>{shareMut.error}</div>
          )}

          <div style={{ marginBottom: "var(--space-4)" }}>
            <select
              className={styles.select}
              style={{ width: "100%" }}
              value={shareProtocol}
              onChange={(e) =>
                setShareProtocol(e.target.value as "nfs" | "smb")
              }
            >
              <option value="nfs">NFS</option>
              <option value="smb">SMB</option>
            </select>
          </div>

          <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
            <button
              className={styles.btnGhost}
              onClick={() => setShareTarget(null)}
              disabled={shareMut.loading}
            >
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={handleShare}
              disabled={shareMut.loading}
            >
              <Share2 size={14} />
              {shareMut.loading ? "Sharing..." : "Share"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPropertiesPanel = () => {
    if (!selectedDataset) return null;

    return (
      <div className={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-4)",
          }}
        >
          <div className={styles.cardTitle}>
            <Database
              size={16}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}
            />
            {selectedDataset}
          </div>
          <button
            className={styles.btnGhost}
            onClick={() => setSelectedDataset(null)}
            style={{ padding: "var(--space-1)" }}
          >
            <X size={16} />
          </button>
        </div>

        {propsError && <div className={styles.error}>{propsError}</div>}
        {propsLoading && <div className={styles.loading}>Loading properties...</div>}

        {properties && !propsLoading && (
          <>
            {/* Summary stats */}
            <div className={styles.grid4} style={{ marginBottom: "var(--space-4)" }}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Used</div>
                <div className={styles.statValue}>
                  {selectedSummary?.used ?? properties.used?.value ?? "-"}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Available</div>
                <div className={styles.statValue}>
                  {selectedSummary?.avail ?? properties.available?.value ?? "-"}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Referenced</div>
                <div className={styles.statValue}>
                  {selectedSummary?.refer ?? properties.referenced?.value ?? "-"}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Compress Ratio</div>
                <div className={styles.statValue}>
                  {properties.compressratio?.value ?? "-"}
                </div>
              </div>
            </div>

            {/* Property table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    textAlign: "left",
                  }}
                >
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Property
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Value
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {DISPLAY_PROPS.map((prop) => {
                  const entry = properties[prop];
                  if (!entry) return null;
                  return (
                    <tr
                      key={prop}
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                    >
                      <td
                        className={styles.mono}
                        style={{ padding: "var(--space-2)" }}
                      >
                        {prop}
                      </td>
                      <td
                        className={styles.mono}
                        style={{ padding: "var(--space-2)" }}
                      >
                        {entry.value}
                      </td>
                      <td style={{ padding: "var(--space-2)" }}>
                        <span className={styles.badgeMuted}>{entry.source}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Action buttons */}
            <div
              className={styles.actions}
              style={{ marginTop: "var(--space-4)" }}
            >
              {isMounted ? (
                <button
                  className={styles.btnGhost}
                  onClick={handleUnmount}
                  disabled={unmountMut.loading}
                >
                  <FolderClosed size={14} />
                  {unmountMut.loading ? "Unmounting..." : "Unmount"}
                </button>
              ) : (
                <button
                  className={styles.btnGhost}
                  onClick={handleMount}
                  disabled={mountMut.loading}
                >
                  <FolderOpen size={14} />
                  {mountMut.loading ? "Mounting..." : "Mount"}
                </button>
              )}

              <button
                className={styles.btnGhost}
                onClick={() => setShareTarget(selectedDataset)}
              >
                <Share2 size={14} />
                Share
              </button>

              <button
                className={styles.btnDanger}
                onClick={() => setDestroyTarget(selectedDataset)}
              >
                <Trash2 size={14} />
                Destroy
              </button>
            </div>

            {(mountMut.error || unmountMut.error) && (
              <div className={styles.error} style={{ marginTop: "var(--space-3)" }}>
                {mountMut.error || unmountMut.error}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // --- Main render ---

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Datasets</h1>
        <div className={styles.actions}>
          {!poolsLoading && pools && (
            <select
              className={styles.select}
              value={poolFilter}
              onChange={(e) => {
                setPoolFilter(e.target.value);
                setSelectedDataset(null);
              }}
            >
              <option value="">All Pools</option>
              {pools.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            className={styles.btnPrimary}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            Create Dataset
          </button>
        </div>
      </div>

      {/* Error */}
      {datasetsError && <div className={styles.error}>{datasetsError}</div>}

      {/* Loading */}
      {datasetsLoading && <div className={styles.loading}>Loading datasets...</div>}

      {/* Dataset table */}
      {!datasetsLoading && datasets && datasets.length === 0 && (
        <div className={styles.empty}>
          <HardDrive
            size={32}
            style={{ marginBottom: 8, opacity: 0.4 }}
          />
          <div>No datasets found</div>
        </div>
      )}

      {!datasetsLoading && datasets && datasets.length > 0 && (
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  textAlign: "left",
                }}
              >
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  Used
                </th>
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  Avail
                </th>
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  Refer
                </th>
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Mountpoint
                </th>
                <th
                  style={{
                    padding: "var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Compression
                </th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => {
                const depth = getDepth(ds.name);
                const isSelected = selectedDataset === ds.name;
                return (
                  <tr
                    key={ds.name}
                    onClick={() => handleRowClick(ds.name)}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      cursor: "pointer",
                      background: isSelected
                        ? "var(--color-bg-hover)"
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background =
                          "var(--color-bg-surface)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "";
                      }
                    }}
                  >
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        paddingLeft: `calc(var(--space-3) + ${depth} * var(--space-6))`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Database
                        size={14}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 6,
                          opacity: 0.5,
                        }}
                      />
                      {ds.name.includes("/")
                        ? ds.name.split("/").pop()
                        : ds.name}
                    </td>
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      {ds.used}
                    </td>
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      {ds.avail}
                    </td>
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      {ds.refer}
                    </td>
                    <td
                      className={styles.mono}
                      style={{ padding: "var(--space-2) var(--space-3)" }}
                    >
                      {ds.mountpoint || "-"}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <span className={styles.badgeMuted}>
                        {ds.compression}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Properties panel */}
      {renderPropertiesPanel()}

      {/* Create modal */}
      {renderCreateModal()}

      {/* Share modal */}
      {renderShareModal()}

      {/* Destroy confirm dialog */}
      {destroyTarget && (
        <ConfirmDialog
          title="Destroy Dataset"
          message={`This will permanently destroy the dataset "${destroyTarget}" and all of its data. This action cannot be undone.`}
          confirmValue={destroyTarget}
          confirmLabel="Destroy"
          onConfirm={handleDestroy}
          onCancel={() => setDestroyTarget(null)}
          loading={destroyMut.loading}
        />
      )}
    </div>
  );
}
