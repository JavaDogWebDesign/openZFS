import { FormEvent, useCallback, useMemo, useState } from "react";
import {
  Check,
  Database,
  FolderOpen,
  FolderClosed,
  HardDrive,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Type,
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
  setDatasetProperties,
  renameDataset,
  type DatasetSummary,
  type PoolSummary,
  type SmbOptions as ApiSmbOptions,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
import { computePresets, type PresetState } from "@/lib/sharing-presets";
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
  "type", "creation", "used", "available", "referenced", "compressratio",
  "compression", "mountpoint", "mounted", "quota", "reservation", "recordsize",
  "atime", "relatime", "checksum", "dedup", "sharenfs", "sharesmb",
  "readonly", "canmount", "snapdir", "primarycache", "secondarycache",
] as const;

const EDITABLE_PROPS = new Set([
  "compression", "quota", "reservation", "recordsize", "atime", "relatime",
  "checksum", "dedup", "readonly", "canmount", "snapdir", "primarycache", "secondarycache",
  "sharenfs", "sharesmb",
]);

const PROP_OPTIONS: Record<string, string[]> = {
  compression: ["on", "off", "lz4", "gzip", "zstd", "lzjb", "zle"],
  atime: ["on", "off"],
  relatime: ["on", "off"],
  checksum: ["on", "off", "fletcher2", "fletcher4", "sha256", "sha512", "skein"],
  dedup: ["on", "off", "verify"],
  readonly: ["on", "off"],
  canmount: ["on", "off", "noauto"],
  snapdir: ["hidden", "visible"],
  primarycache: ["all", "none", "metadata"],
  secondarycache: ["all", "none", "metadata"],
};

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
  const [shareProtocol, setShareProtocol] = useState<"nfs" | "smb">("smb");
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Create modal: share this dataset
  const [createShareEnabled, setCreateShareEnabled] = useState(false);
  const [createShareProtocol, setCreateShareProtocol] = useState<"nfs" | "smb">("smb");
  const [createPresetShadow, setCreatePresetShadow] = useState(false);
  const [createPresetMacOs, setCreatePresetMacOs] = useState(false);
  const [createPresetAudit, setCreatePresetAudit] = useState(false);

  // Share modal presets + connection info
  const [sharePresetShadow, setSharePresetShadow] = useState(false);
  const [sharePresetMacOs, setSharePresetMacOs] = useState(false);
  const [sharePresetAudit, setSharePresetAudit] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // --- Data fetching ---

  const { data: pools, loading: poolsLoading } = useApi<PoolSummary[]>(() => listPools(), []);

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

  const createMut = useMutation((form: CreateForm) => {
    const props: Record<string, string> = {};
    if (form.compression) props.compression = form.compression;
    if (form.quota) props.quota = form.quota;
    if (form.reservation) props.reservation = form.reservation;
    if (form.mountpoint) props.mountpoint = form.mountpoint;
    return createDataset({
      name: form.name,
      properties: Object.keys(props).length > 0 ? props : undefined,
    });
  });

  const destroyMut = useMutation((name: string) => destroyDataset(name, name, false, false));
  const mountMut = useMutation((name: string) => mountDataset(name));
  const unmountMut = useMutation((name: string) => unmountDataset(name));
  const shareMut = useMutation(
    (name: string, protocol: "nfs" | "smb", options?: string, smbOptions?: ApiSmbOptions) =>
      shareDataset(name, protocol, options, smbOptions),
  );
  const setPropMut = useMutation(
    (name: string, prop: string, val: string) => setDatasetProperties(name, { [prop]: val }),
  );
  const renameMut = useMutation(
    (name: string, newName: string) => renameDataset(name, newName),
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

        // If share enabled, also share
        if (createShareEnabled) {
          let apiSmbOpts: ApiSmbOptions | undefined;
          if (createShareProtocol === "smb") {
            const presets: PresetState = { shadow: createPresetShadow, macOs: createPresetMacOs, audit: createPresetAudit };
            const { vfsObjects, extraParams } = computePresets(presets, "", {});
            apiSmbOpts = {
              guest_ok: false,
              browseable: true,
              read_only: false,
              valid_users: "",
              write_list: "",
              create_mask: "",
              directory_mask: "",
              force_user: "",
              force_group: "",
              inherit_permissions: false,
              vfs_objects: vfsObjects,
              extra_params: extraParams,
            };
          }
          const shareResult = await shareMut.execute(
            createForm.name,
            createShareProtocol,
            createShareProtocol === "nfs" ? "rw,sync,no_subtree_check" : "on",
            apiSmbOpts,
          );
          if (shareResult) {
            addToast("success", `Shared ${createForm.name} via ${createShareProtocol.toUpperCase()}`);
          }
        }

        setShowCreateModal(false);
        setCreateForm(EMPTY_CREATE_FORM);
        setCreateShareEnabled(false);
        setCreatePresetShadow(false);
        setCreatePresetMacOs(false);
        setCreatePresetAudit(false);
        refetchDatasets();
      }
    },
    [createForm, createMut, createShareEnabled, createShareProtocol, createPresetShadow, createPresetMacOs, createPresetAudit, shareMut, refetchDatasets, addToast],
  );

  const handleDestroy = useCallback(async () => {
    if (!destroyTarget) return;
    const result = await destroyMut.execute(destroyTarget);
    if (result) {
      addToast("success", `Dataset ${destroyTarget} destroyed`);
      setDestroyTarget(null);
      if (selectedDataset === destroyTarget) setSelectedDataset(null);
      refetchDatasets();
    }
  }, [destroyTarget, destroyMut, selectedDataset, refetchDatasets, addToast]);

  const handleMount = useCallback(async () => {
    if (!selectedDataset) return;
    const result = await mountMut.execute(selectedDataset);
    if (result) {
      addToast("success", `Dataset ${selectedDataset} mounted`);
      refetchProps();
      refetchDatasets();
    }
  }, [selectedDataset, mountMut, refetchProps, refetchDatasets, addToast]);

  const handleUnmount = useCallback(async () => {
    if (!selectedDataset) return;
    const result = await unmountMut.execute(selectedDataset);
    if (result) {
      addToast("success", `Dataset ${selectedDataset} unmounted`);
      refetchProps();
      refetchDatasets();
    }
  }, [selectedDataset, unmountMut, refetchProps, refetchDatasets, addToast]);

  const handleShare = useCallback(async () => {
    if (!shareTarget) return;
    let apiSmbOpts: ApiSmbOptions | undefined;
    if (shareProtocol === "smb") {
      const presets: PresetState = { shadow: sharePresetShadow, macOs: sharePresetMacOs, audit: sharePresetAudit };
      const { vfsObjects, extraParams } = computePresets(presets, "", {});
      apiSmbOpts = {
        guest_ok: false,
        browseable: true,
        read_only: false,
        valid_users: "",
        write_list: "",
        create_mask: "",
        directory_mask: "",
        force_user: "",
        force_group: "",
        inherit_permissions: false,
        vfs_objects: vfsObjects,
        extra_params: extraParams,
      };
    }
    const result = await shareMut.execute(
      shareTarget,
      shareProtocol,
      shareProtocol === "nfs" ? "rw,sync,no_subtree_check" : "on",
      apiSmbOpts,
    );
    if (result) {
      addToast("success", `Dataset ${shareTarget} shared via ${shareProtocol.toUpperCase()}`);
      setShareSuccess(true);
      refetchProps();
    }
  }, [shareTarget, shareProtocol, sharePresetShadow, sharePresetMacOs, sharePresetAudit, shareMut, refetchProps, addToast]);

  const handleSaveProp = useCallback(async () => {
    if (!selectedDataset || !editingProp) return;
    const result = await setPropMut.execute(selectedDataset, editingProp, editValue);
    if (result) {
      addToast("success", `Property "${editingProp}" updated to "${editValue}"`);
      setEditingProp(null);
      setEditValue("");
      refetchProps();
    }
  }, [selectedDataset, editingProp, editValue, setPropMut, addToast, refetchProps]);

  const handleCancelEdit = useCallback(() => {
    setEditingProp(null);
    setEditValue("");
  }, []);

  const handleStartEdit = useCallback((prop: string, currentValue: string) => {
    setEditingProp(prop);
    setEditValue(currentValue);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const result = await renameMut.execute(renameTarget, renameValue.trim());
    if (result) {
      addToast("success", `Dataset renamed to ${renameValue.trim()}`);
      setRenameTarget(null);
      setRenameValue("");
      if (selectedDataset === renameTarget) setSelectedDataset(renameValue.trim());
      refetchDatasets();
    } else if (renameMut.error) {
      addToast("error", renameMut.error);
    }
  }, [renameTarget, renameValue, renameMut, selectedDataset, refetchDatasets, addToast]);

  const openShareModal = (dsName: string) => {
    setShareTarget(dsName);
    setShareProtocol("smb");
    setSharePresetShadow(false);
    setSharePresetMacOs(false);
    setSharePresetAudit(false);
    setShareSuccess(false);
  };

  // --- Render helpers ---

  const renderCreateModal = () => {
    if (!showCreateModal) return null;

    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        onClick={() => setShowCreateModal(false)}
      >
        <div className={styles.card} style={{ width: 480, margin: 0 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <div className={styles.cardTitle}>Create Dataset</div>
            <button className={styles.btnGhost} onClick={() => setShowCreateModal(false)} style={{ padding: "var(--space-1)" }}>
              <X size={16} />
            </button>
          </div>

          {createMut.error && <div className={styles.error}>{createMut.error}</div>}

          <form onSubmit={handleCreateSubmit}>
            <div style={{ marginBottom: "var(--space-3)" }}>
              <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-1)" }}>
                Dataset Name *
              </label>
              <input
                className={styles.select}
                style={{ width: "100%", boxSizing: "border-box" }}
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="pool/dataset"
                required
                autoFocus
              />
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
                Full path including pool, e.g. tank/mydata
              </div>
            </div>

            {/* Share this dataset */}
            <div style={{ marginBottom: "var(--space-3)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={createShareEnabled} onChange={(e) => setCreateShareEnabled(e.target.checked)} />
                Share this dataset
              </label>
              {createShareEnabled && (
                <div style={{ marginTop: "var(--space-2)", paddingLeft: "var(--space-5)" }}>
                  <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                    <select
                      className={styles.select}
                      value={createShareProtocol}
                      onChange={(e) => setCreateShareProtocol(e.target.value as "nfs" | "smb")}
                      style={{ width: 100 }}
                    >
                      <option value="smb">SMB</option>
                      <option value="nfs">NFS</option>
                    </select>
                  </div>
                  {createShareProtocol === "smb" && (
                    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                        <input type="checkbox" checked={createPresetShadow} onChange={(e) => setCreatePresetShadow(e.target.checked)} />
                        Shadow Copy
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                        <input type="checkbox" checked={createPresetMacOs} onChange={(e) => setCreatePresetMacOs(e.target.checked)} />
                        macOS
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                        <input type="checkbox" checked={createPresetAudit} onChange={(e) => setCreatePresetAudit(e.target.checked)} />
                        Audit
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <AdvancedOptions>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-1)" }}>Compression</label>
                <select className={styles.select} style={{ width: "100%" }} value={createForm.compression} onChange={(e) => setCreateForm((f) => ({ ...f, compression: e.target.value }))}>
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
                  <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-1)" }}>Quota</label>
                  <input className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={createForm.quota} onChange={(e) => setCreateForm((f) => ({ ...f, quota: e.target.value }))} placeholder="e.g. 10G" />
                </div>
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-1)" }}>Reservation</label>
                  <input className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={createForm.reservation} onChange={(e) => setCreateForm((f) => ({ ...f, reservation: e.target.value }))} placeholder="e.g. 5G" />
                </div>
              </div>

              <div style={{ marginBottom: "var(--space-3)" }}>
                <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-1)" }}>Mountpoint</label>
                <input className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={createForm.mountpoint} onChange={(e) => setCreateForm((f) => ({ ...f, mountpoint: e.target.value }))} placeholder="/mnt/data (optional)" />
              </div>
            </AdvancedOptions>

            <div className={styles.actions} style={{ justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
              <button type="button" className={styles.btnGhost} onClick={() => setShowCreateModal(false)} disabled={createMut.loading}>Cancel</button>
              <button type="submit" className={styles.btnPrimary} disabled={createMut.loading || !createForm.name}>
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
    const hostname = window.location.hostname;
    const shareName = shareTarget.replace(/\//g, "_");
    const mountpoint = `/${shareTarget}`;

    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        onClick={() => setShareTarget(null)}
      >
        <div className={styles.card} style={{ width: 440, margin: 0 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
            <div className={styles.cardTitle}>Share Dataset</div>
            <button className={styles.btnGhost} onClick={() => setShareTarget(null)} style={{ padding: "var(--space-1)" }}>
              <X size={16} />
            </button>
          </div>

          <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            Share <span className={styles.mono}>{shareTarget}</span> via:
          </p>

          {shareMut.error && <div className={styles.error}>{shareMut.error}</div>}

          {!shareSuccess ? (
            <>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <select className={styles.select} style={{ width: "100%" }} value={shareProtocol} onChange={(e) => setShareProtocol(e.target.value as "nfs" | "smb")}>
                  <option value="smb">SMB</option>
                  <option value="nfs">NFS</option>
                </select>
              </div>

              {shareProtocol === "smb" && (
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-2)", fontWeight: 600 }}>Presets</div>
                  <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                      <input type="checkbox" checked={sharePresetShadow} onChange={(e) => setSharePresetShadow(e.target.checked)} />
                      Shadow Copy
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                      <input type="checkbox" checked={sharePresetMacOs} onChange={(e) => setSharePresetMacOs(e.target.checked)} />
                      macOS
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                      <input type="checkbox" checked={sharePresetAudit} onChange={(e) => setSharePresetAudit(e.target.checked)} />
                      Audit
                    </label>
                  </div>
                </div>
              )}

              <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
                <button className={styles.btnGhost} onClick={() => setShareTarget(null)} disabled={shareMut.loading}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleShare} disabled={shareMut.loading}>
                  <Share2 size={14} />
                  {shareMut.loading ? "Sharing..." : "Share"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Connection instructions */}
              <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
                <div style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Connection Instructions</div>
                {shareProtocol === "smb" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <div><strong>macOS:</strong> Finder &rarr; Go &rarr; Connect &rarr; <code className={styles.mono}>smb://{hostname}/{shareName}</code></div>
                    <div><strong>Windows:</strong> <code className={styles.mono}>\\{hostname}\{shareName}</code></div>
                    <div><strong>Linux:</strong> <code className={styles.mono}>smb://{hostname}/{shareName}</code></div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <div><strong>Linux/macOS:</strong> <code className={styles.mono}>sudo mount -t nfs {hostname}:{mountpoint} /mnt/point</code></div>
                    <div><strong>Windows:</strong> <code className={styles.mono}>mount \\{hostname}\{mountpoint} Z:</code></div>
                  </div>
                )}
              </div>
              <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
                <button className={styles.btnPrimary} onClick={() => setShareTarget(null)}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderPropertiesPanel = () => {
    if (!selectedDataset) return null;

    return (
      <div className={styles.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <div className={styles.cardTitle}>
            <Database size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            {selectedDataset}
          </div>
          <button className={styles.btnGhost} onClick={() => setSelectedDataset(null)} style={{ padding: "var(--space-1)" }}>
            <X size={16} />
          </button>
        </div>

        {propsError && <div className={styles.error}>{propsError}</div>}
        {propsLoading && <div className={styles.loading}>Loading properties...</div>}

        {properties && !propsLoading && (
          <>
            <div className={styles.grid4} style={{ marginBottom: "var(--space-4)" }}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Used</div>
                <div className={styles.statValue}>{formatBytes(Number(selectedSummary?.used ?? properties.used?.value ?? 0))}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Available</div>
                <div className={styles.statValue}>{formatBytes(Number(selectedSummary?.avail ?? properties.available?.value ?? 0))}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Referenced</div>
                <div className={styles.statValue}>{formatBytes(Number(selectedSummary?.refer ?? properties.referenced?.value ?? 0))}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Compress Ratio</div>
                <div className={styles.statValue}>{properties.compressratio?.value ?? "-"}</div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Property</th>
                  <th style={{ padding: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Value</th>
                  <th style={{ padding: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {DISPLAY_PROPS.map((prop) => {
                  const entry = properties[prop];
                  if (!entry) return null;
                  const isEditable = EDITABLE_PROPS.has(prop);
                  const isEditing = editingProp === prop;
                  const hasOptions = prop in PROP_OPTIONS;
                  return (
                    <tr key={prop} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className={styles.mono} style={{ padding: "var(--space-2)" }}>{prop}</td>
                      <td className={styles.mono} style={{ padding: "var(--space-2)" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                            {hasOptions ? (
                              <select className={styles.select} style={{ flex: 1, fontSize: "var(--text-sm)" }} value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus>
                                {PROP_OPTIONS[prop].map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className={styles.select}
                                style={{ flex: 1, fontSize: "var(--text-sm)", boxSizing: "border-box" }}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveProp(); if (e.key === "Escape") handleCancelEdit(); }}
                                autoFocus
                              />
                            )}
                            <button className={styles.btnGhost} style={{ padding: "2px 4px", lineHeight: 1 }} onClick={handleSaveProp} disabled={setPropMut.loading} title="Save"><Check size={14} /></button>
                            <button className={styles.btnGhost} style={{ padding: "2px 4px", lineHeight: 1 }} onClick={handleCancelEdit} disabled={setPropMut.loading} title="Cancel"><X size={14} /></button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                            <span>{entry.value}</span>
                            {isEditable && (
                              <button className={styles.btnGhost} style={{ padding: "2px 4px", lineHeight: 1, opacity: 0.5 }} onClick={() => handleStartEdit(prop, entry.value)} title={`Edit ${prop}`}>
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "var(--space-2)" }}>
                        <span className={styles.badgeMuted}>{entry.source}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.actions} style={{ marginTop: "var(--space-4)" }}>
              {isMounted ? (
                <button className={styles.btnGhost} onClick={handleUnmount} disabled={unmountMut.loading}>
                  <FolderClosed size={14} /> {unmountMut.loading ? "Unmounting..." : "Unmount"}
                </button>
              ) : (
                <button className={styles.btnGhost} onClick={handleMount} disabled={mountMut.loading}>
                  <FolderOpen size={14} /> {mountMut.loading ? "Mounting..." : "Mount"}
                </button>
              )}

              <button className={styles.btnGhost} onClick={() => openShareModal(selectedDataset)}>
                <Share2 size={14} /> Share
              </button>

              {renameTarget === selectedDataset ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                  <input
                    className={styles.select}
                    style={{ fontSize: "var(--text-sm)", width: 200, boxSizing: "border-box" }}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenameTarget(null); setRenameValue(""); } }}
                    autoFocus
                    placeholder="new/dataset/name"
                  />
                  <button className={styles.btnPrimary} style={{ padding: "var(--space-1) var(--space-2)" }} onClick={handleRename} disabled={renameMut.loading || !renameValue.trim()}>
                    {renameMut.loading ? "..." : "Save"}
                  </button>
                  <button className={styles.btnGhost} style={{ padding: "var(--space-1) var(--space-2)" }} onClick={() => { setRenameTarget(null); setRenameValue(""); }}>Cancel</button>
                </div>
              ) : (
                <button className={styles.btnGhost} onClick={() => { if (selectedDataset) { setRenameTarget(selectedDataset); setRenameValue(selectedDataset); } }}>
                  <Type size={14} /> Rename
                </button>
              )}

              <button className={styles.btnDanger} onClick={() => setDestroyTarget(selectedDataset)}>
                <Trash2 size={14} /> Destroy
              </button>
            </div>

            {(mountMut.error || unmountMut.error || setPropMut.error || renameMut.error) && (
              <div className={styles.error} style={{ marginTop: "var(--space-3)" }}>
                {mountMut.error || unmountMut.error || setPropMut.error || renameMut.error}
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
      <div className={styles.header}>
        <h1 className={styles.title}>Datasets</h1>
        <div className={styles.actions}>
          {!poolsLoading && pools && (
            <select className={styles.select} value={poolFilter} onChange={(e) => { setPoolFilter(e.target.value); setSelectedDataset(null); }}>
              <option value="">All Pools</option>
              {pools.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          )}
          <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Create Dataset
          </button>
        </div>
      </div>

      {datasetsError && <div className={styles.error}>{datasetsError}</div>}
      {datasetsLoading && <div className={styles.loading}>Loading datasets...</div>}

      {!datasetsLoading && datasets && datasets.length === 0 && (
        <div className={styles.empty}>
          <HardDrive size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>No datasets found</div>
        </div>
      )}

      {!datasetsLoading && datasets && datasets.length > 0 && (
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Name</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", textAlign: "right" }}>Used</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", textAlign: "right" }}>Avail</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", textAlign: "right" }}>Refer</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Mountpoint</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Compression</th>
                <th style={{ padding: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", width: 50 }}></th>
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
                    style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer", background: isSelected ? "var(--color-bg-hover)" : undefined }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--color-bg-surface)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = ""; }}
                  >
                    <td className={styles.mono} style={{ padding: "var(--space-2) var(--space-3)", paddingLeft: `calc(var(--space-3) + ${depth} * var(--space-6))`, whiteSpace: "nowrap" }}>
                      <Database size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6, opacity: 0.5 }} />
                      {ds.name.includes("/") ? ds.name.split("/").pop() : ds.name}
                    </td>
                    <td className={styles.mono} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatBytes(Number(ds.used))}</td>
                    <td className={styles.mono} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatBytes(Number(ds.avail))}</td>
                    <td className={styles.mono} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatBytes(Number(ds.refer))}</td>
                    <td className={styles.mono} style={{ padding: "var(--space-2) var(--space-3)" }}>{ds.mountpoint || "-"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <span className={styles.badgeMuted}>{ds.compression}</span>
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
                      <button
                        className={styles.btnGhost}
                        style={{ padding: "4px", lineHeight: 1, opacity: 0.5 }}
                        onClick={(e) => { e.stopPropagation(); openShareModal(ds.name); }}
                        title="Share dataset"
                      >
                        <Share2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {renderPropertiesPanel()}
      {renderCreateModal()}
      {renderShareModal()}

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
