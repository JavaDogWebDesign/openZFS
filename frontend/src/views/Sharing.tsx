import { useCallback, useState } from "react";
import {
  listDatasets,
  getDatasetProperties,
  shareDataset,
  unshareDataset,
  listSmbShares,
  getSambaGlobalSettings,
  setSambaGlobalSettings,
  exportSambaConfig,
  importSambaConfig,
  listNfsExports,
  addNfsExport,
  removeNfsExport,
  type DatasetSummary,
  type SmbOptions as ApiSmbOptions,
  type SmbShareInfo,
  type NfsExport,
  type SambaGlobalSettings as ApiSambaGlobalSettings,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { useToast } from "@/components/Toast";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { computePresets, type PresetState } from "@/lib/sharing-presets";
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
  Download,
  Upload,
  Plus,
  Globe,
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
  extra_params: Record<string, string>;
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
  extra_params: {},
};

function buildNfsOptions(opts: NfsOptions): string {
  const parts: string[] = [opts.permissions];
  if (opts.noRootSquash) parts.push("no_root_squash");
  if (opts.sync) parts.push("sync");
  else parts.push("async");
  if (opts.noSubtreeCheck) parts.push("no_subtree_check");
  return parts.join(",");
}

function buildSmbOptions(_opts: SmbOptions): string {
  return "on";
}

export function Sharing() {
  const [shareDetails, setShareDetails] = useState<ShareInfo[]>([]);
  const [encryptionDetails, setEncryptionDetails] = useState<EncryptionInfo[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // New share form
  const [newShareDataset, setNewShareDataset] = useState("");
  const [newShareProtocol, setNewShareProtocol] = useState<"nfs" | "smb">("nfs");
  const [nfsOpts, setNfsOpts] = useState<NfsOptions>({ ...DEFAULT_NFS });
  const [smbOpts, setSmbOpts] = useState<SmbOptions>({ ...DEFAULT_SMB });

  // SMB Share Presets
  const [presetShadow, setPresetShadow] = useState(false);
  const [presetMacOs, setPresetMacOs] = useState(false);
  const [presetAudit, setPresetAudit] = useState(false);

  // NFS Client Access state
  const [newNfsPath, setNewNfsPath] = useState("");
  const [newNfsClient, setNewNfsClient] = useState("");
  const [newNfsOptions, setNewNfsOptions] = useState("rw,sync,no_subtree_check");

  // Samba Global Settings state
  const [sambaServerString, setSambaServerString] = useState("");
  const [sambaWorkgroup, setSambaWorkgroup] = useState("");
  const [sambaLogLevel, setSambaLogLevel] = useState<number>(0);
  const [sambaSettingsLoaded, setSambaSettingsLoaded] = useState(false);
  const [showImportConfig, setShowImportConfig] = useState(false);
  const [importConfigText, setImportConfigText] = useState("");

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
    data: smbShares,
    refetch: refetchSmbShares,
  } = useApi(() => listSmbShares(), []);

  // NFS Exports
  const {
    data: nfsExports,
    loading: nfsExportsLoading,
    refetch: refetchNfsExports,
  } = useApi(() => listNfsExports(), []);

  const addNfsExportMutation = useMutation((path: string, client: string, options: string) =>
    addNfsExport(path, client, options),
  );
  const removeNfsExportMutation = useMutation((path: string, client: string) =>
    removeNfsExport(path, client),
  );

  // Samba Global Settings
  const {
    data: sambaGlobalData,
    refetch: refetchSambaGlobal,
  } = useApi(() => getSambaGlobalSettings(), []);

  if (sambaGlobalData && !sambaSettingsLoaded) {
    setSambaServerString(sambaGlobalData.server_string ?? "");
    setSambaWorkgroup(sambaGlobalData.workgroup ?? "");
    setSambaLogLevel(sambaGlobalData.log_level ?? 0);
    setSambaSettingsLoaded(true);
  }

  const saveSambaGlobalMutation = useMutation((settings: Partial<ApiSambaGlobalSettings>) =>
    setSambaGlobalSettings(settings),
  );
  const importSambaConfigMutation = useMutation((content: string) =>
    importSambaConfig(content),
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

        const sharenfs = props["sharenfs"]?.value ?? "off";
        const sharesmb = props["sharesmb"]?.value ?? "off";
        if (sharenfs !== "off" && sharenfs !== "-") {
          shares.push({ dataset: ds.name, protocol: "nfs", options: sharenfs, active: true });
        }
        if (sharesmb !== "off" && sharesmb !== "-") {
          shares.push({ dataset: ds.name, protocol: "smb", options: sharesmb, active: true });
        }

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
      setDetailsError(err instanceof Error ? err.message : "Failed to load details");
    } finally {
      setDetailsLoading(false);
    }
  }, [datasets]);

  useApi(
    () => {
      if (datasets?.length) loadDetails();
      return Promise.resolve(null);
    },
    [datasets],
  );

  const currentPresets: PresetState = { shadow: presetShadow, macOs: presetMacOs, audit: presetAudit };

  const handleShare = async () => {
    if (!newShareDataset) return;
    const options =
      newShareProtocol === "nfs"
        ? buildNfsOptions(nfsOpts)
        : buildSmbOptions(smbOpts);

    let apiSmbOpts: ApiSmbOptions | undefined;
    if (newShareProtocol === "smb") {
      const { vfsObjects, extraParams } = computePresets(currentPresets, smbOpts.vfsObjects, smbOpts.extra_params);
      apiSmbOpts = {
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
        vfs_objects: vfsObjects,
        extra_params: extraParams,
      };
    }

    const result = await shareMutation.execute(newShareDataset, newShareProtocol, options, apiSmbOpts);
    if (result) {
      addToast("success", `Shared ${newShareDataset} via ${newShareProtocol.toUpperCase()}`);
      setNewShareDataset("");
      setNfsOpts({ ...DEFAULT_NFS });
      setSmbOpts({ ...DEFAULT_SMB });
      setPresetShadow(false);
      setPresetMacOs(false);
      setPresetAudit(false);
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
    refetchSmbShares();
    refetchNfsExports();
    refetchSambaGlobal();
    setSambaSettingsLoaded(false);
  };

  const handleAddNfsExport = async () => {
    if (!newNfsPath || !newNfsClient) return;
    const result = await addNfsExportMutation.execute(newNfsPath, newNfsClient, newNfsOptions);
    if (result) {
      addToast("success", `NFS export added: ${newNfsPath} for ${newNfsClient}`);
      setNewNfsPath("");
      setNewNfsClient("");
      setNewNfsOptions("rw,sync,no_subtree_check");
      refetchNfsExports();
    } else if (addNfsExportMutation.error) {
      addToast("error", addNfsExportMutation.error);
    }
  };

  const handleRemoveNfsExport = async (path: string, client: string) => {
    const result = await removeNfsExportMutation.execute(path, client);
    if (result) {
      addToast("success", `NFS export removed: ${path} for ${client}`);
      refetchNfsExports();
    } else if (removeNfsExportMutation.error) {
      addToast("error", removeNfsExportMutation.error);
    }
  };

  const handleSaveSambaGlobal = async () => {
    const result = await saveSambaGlobalMutation.execute({
      server_string: sambaServerString,
      workgroup: sambaWorkgroup,
      log_level: sambaLogLevel,
    });
    if (result) {
      addToast("success", "Samba global settings saved");
      refetchSambaGlobal();
    } else if (saveSambaGlobalMutation.error) {
      addToast("error", saveSambaGlobalMutation.error);
    }
  };

  const handleExportSambaConfig = async () => {
    try {
      const content = await exportSambaConfig();
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zfs-manager-shares.conf";
      a.click();
      URL.revokeObjectURL(url);
      addToast("success", "Samba config downloaded");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to export config");
    }
  };

  const handleImportSambaConfig = async () => {
    if (!importConfigText.trim()) return;
    const result = await importSambaConfigMutation.execute(importConfigText);
    if (result) {
      addToast("success", "Samba config imported successfully");
      setShowImportConfig(false);
      setImportConfigText("");
      refetchSambaGlobal();
      refetchSmbShares();
      loadDetails();
    } else if (importSambaConfigMutation.error) {
      addToast("error", importSambaConfigMutation.error);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportConfigText(reader.result as string);
    reader.readAsText(file);
  };

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
        <h1 className={s.title}>Sharing</h1>
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {datasetsError && <div className={s.error}>{datasetsError}</div>}
      {detailsError && <div className={s.error}>{detailsError}</div>}

      {/* Share a Dataset form */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Share2 size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          Share a Dataset
        </h2>

        {shareMutation.error && (
          <div className={s.error} style={{ marginBottom: "var(--space-3)" }}>{shareMutation.error}</div>
        )}

        {/* Dataset + Protocol */}
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
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
              {datasets?.map((ds: DatasetSummary) => {
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

        {/* Protocol-specific basic options */}
        {newShareProtocol === "nfs" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div>
              <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Host access control is configured in <code>/etc/exports</code>, not via ZFS properties.
              </div>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Permissions</label>
              <select className={s.select} style={{ width: "100%" }} value={nfsOpts.permissions} onChange={(e) => setNfsOpts((o) => ({ ...o, permissions: e.target.value as "rw" | "ro" }))}>
                <option value="rw">Read/Write</option>
                <option value="ro">Read Only</option>
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            {/* Basic SMB checkboxes */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={smbOpts.guestOk} onChange={(e) => setSmbOpts((o) => ({ ...o, guestOk: e.target.checked }))} />
                Guest access
              </label>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>Allow access without a password.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={smbOpts.browseable} onChange={(e) => setSmbOpts((o) => ({ ...o, browseable: e.target.checked }))} />
                Browseable
              </label>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>Make visible when browsing the network.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={smbOpts.readOnly} onChange={(e) => setSmbOpts((o) => ({ ...o, readOnly: e.target.checked }))} />
                Read only
              </label>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>Prevent clients from modifying files.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={smbOpts.inheritPermissions} onChange={(e) => setSmbOpts((o) => ({ ...o, inheritPermissions: e.target.checked }))} />
                Inherit permissions
              </label>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>New files inherit parent permissions.</div>
            </div>

            {/* Presets row */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Presets</label>
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={presetShadow} onChange={(e) => setPresetShadow(e.target.checked)} />
                  Shadow Copy
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={presetMacOs} onChange={(e) => setPresetMacOs(e.target.checked)} />
                  macOS (fruit)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={presetAudit} onChange={(e) => setPresetAudit(e.target.checked)} />
                  Audit Log
                </label>
              </div>
            </div>
          </div>
        )}

        {/* NFS advanced options */}
        {newShareProtocol === "nfs" && (
          <AdvancedOptions>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={nfsOpts.noRootSquash} onChange={(e) => setNfsOpts((o) => ({ ...o, noRootSquash: e.target.checked }))} />
                  no_root_squash
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Let remote root retain full privileges. Use with caution.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={nfsOpts.sync} onChange={(e) => setNfsOpts((o) => ({ ...o, sync: e.target.checked }))} />
                  Synchronous writes
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Write data to disk before acknowledging.
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer", marginTop: "var(--space-1)" }}>
                  <input type="checkbox" checked={nfsOpts.noSubtreeCheck} onChange={(e) => setNfsOpts((o) => ({ ...o, noSubtreeCheck: e.target.checked }))} />
                  no_subtree_check
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
                  Recommended for most ZFS shares.
                </div>
              </div>
            </div>
          </AdvancedOptions>
        )}

        {/* SMB advanced options */}
        {newShareProtocol === "smb" && (
          <AdvancedOptions>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Valid users</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="alice bob @staff" value={smbOpts.validUsers} onChange={(e) => setSmbOpts((o) => ({ ...o, validUsers: e.target.value }))} />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>Space-separated users/groups. Leave empty for no restriction.</div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Write list</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="alice @admins" value={smbOpts.writeList} onChange={(e) => setSmbOpts((o) => ({ ...o, writeList: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Create mask</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="0644" value={smbOpts.createMask} onChange={(e) => setSmbOpts((o) => ({ ...o, createMask: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Directory mask</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="0755" value={smbOpts.directoryMask} onChange={(e) => setSmbOpts((o) => ({ ...o, directoryMask: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Force user</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="nobody" value={smbOpts.forceUser} onChange={(e) => setSmbOpts((o) => ({ ...o, forceUser: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Force group</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="nogroup" value={smbOpts.forceGroup} onChange={(e) => setSmbOpts((o) => ({ ...o, forceGroup: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>VFS objects (additional)</label>
                <input className={s.input} style={{ width: "100%" }} placeholder="recycle" value={smbOpts.vfsObjects} onChange={(e) => setSmbOpts((o) => ({ ...o, vfsObjects: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  SMB config is written to <code>/etc/samba/zfs-manager-shares.conf</code> and included in <code>smb.conf</code>.
                </div>
              </div>
            </div>
          </AdvancedOptions>
        )}

        {/* Preview */}
        {newShareDataset && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", marginBottom: "var(--space-3)", marginTop: "var(--space-3)", display: "flex", alignItems: newShareProtocol === "smb" ? "flex-start" : "center", gap: "var(--space-2)" }}>
            <Eye size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0, marginTop: newShareProtocol === "smb" ? 2 : 0 }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", flexShrink: 0 }}>Preview:</span>
            {newShareProtocol === "smb" ? (
              <pre className={s.mono} style={{ fontSize: "var(--text-xs)", margin: 0, whiteSpace: "pre" }}>
{(() => {
  const { vfsObjects: pVfs, extraParams: pExtra } = computePresets(currentPresets, smbOpts.vfsObjects, smbOpts.extra_params);
  return [
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
    pVfs ? `  vfs objects = ${pVfs}` : "",
    ...Object.entries(pExtra).map(([k, v]) => `  ${k} = ${v}`),
  ].filter(Boolean).join("\n");
})()}
              </pre>
            ) : (
              <code className={s.mono} style={{ fontSize: "var(--text-sm)" }}>{previewOptions}</code>
            )}
          </div>
        )}

        <button
          className={s.btnPrimary}
          onClick={handleShare}
          disabled={shareMutation.loading || !newShareDataset}
          style={{ marginTop: "var(--space-2)" }}
        >
          <Share2 size={14} />
          {shareMutation.loading ? "Sharing..." : "Share"}
        </button>
      </div>

      {/* Active Shares — Card Grid */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <FolderOpen size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          Active Shares
        </h2>

        {detailsLoading ? (
          <div className={s.loading}>Loading share details...</div>
        ) : shareDetails.length === 0 ? (
          <div className={s.empty}>
            <FolderOpen size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No datasets are currently shared via NFS or SMB.</div>
          </div>
        ) : (
          <div className={s.grid2}>
            {shareDetails.map((share) => {
              const shareKey = `${share.dataset}-${share.protocol}`;
              const hostname = window.location.hostname;
              const shareName = share.dataset.replace(/\//g, "_");
              const mountpoint = `/${share.dataset}`;
              const isExpanded = expandedConnect === shareKey;
              const smbShareInfo = smbShares?.find((sh: SmbShareInfo) => sh.path === mountpoint || sh.share_name === shareName);
              const userCount = smbShareInfo?.valid_users ? smbShareInfo.valid_users.split(/\s+/).filter(Boolean).length : 0;

              return (
                <div
                  key={shareKey}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    background: "var(--color-bg-surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
                    <div>
                      <div className={s.mono} style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{share.dataset}</div>
                      <div className={s.mono} style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>/{share.dataset}</div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                      <span className={s.badgeMuted}>{share.protocol.toUpperCase()}</span>
                      <span className={s.badgeSuccess}>Active</span>
                    </div>
                  </div>

                  {share.protocol === "smb" && userCount > 0 && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
                      <Users size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      {userCount} user{userCount !== 1 ? "s" : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                    <button
                      className={s.btnGhost}
                      onClick={() => setExpandedConnect(isExpanded ? null : shareKey)}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)" }}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <Info size={12} /> Connect
                    </button>
                    <button
                      className={s.btnDanger}
                      onClick={() => handleUnshare(share.dataset, share.protocol)}
                      disabled={unshareMutation.loading}
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      {unshareMutation.loading ? "..." : "Unshare"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: "var(--space-3)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", fontSize: "var(--text-xs)" }}>
                      <div style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Connection Instructions</div>
                      {share.protocol === "smb" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                          <div><strong>macOS:</strong> Finder &rarr; Go &rarr; Connect &rarr; <code className={s.mono}>smb://{hostname}/{shareName}</code></div>
                          <div><strong>Windows:</strong> <code className={s.mono}>\\{hostname}\{shareName}</code></div>
                          <div><strong>Linux:</strong> <code className={s.mono}>smb://{hostname}/{shareName}</code></div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                          <div><strong>Linux/macOS:</strong> <code className={s.mono}>sudo mount -t nfs {hostname}:{mountpoint} /mnt/point</code></div>
                          <div><strong>Windows:</strong> <code className={s.mono}>mount \\{hostname}\{mountpoint} Z:</code></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NFS Client Access — collapsed */}
      <div className={s.card}>
        <AdvancedOptions label="NFS Client Access">
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
            Per-client NFS export rules managed in <code>/etc/exports.d/zfs-manager.exports</code>.
          </div>

          {nfsExportsLoading ? (
            <div className={s.loading}>Loading NFS exports...</div>
          ) : !nfsExports || nfsExports.length === 0 ? (
            <div className={s.empty}>
              <Globe size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
              <div>No per-client NFS export rules configured.</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--space-3)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Path</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Client</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Options</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nfsExports.map((exp: NfsExport, idx: number) => (
                  <tr key={`${exp.path}-${exp.client}-${idx}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className={s.mono} style={{ padding: "var(--space-3)" }}>{exp.path}</td>
                    <td className={s.mono} style={{ padding: "var(--space-3)" }}>{exp.client}</td>
                    <td className={s.mono} style={{ padding: "var(--space-3)" }}>{exp.options}</td>
                    <td style={{ padding: "var(--space-3)" }}>
                      <button className={s.btnDanger} onClick={() => handleRemoveNfsExport(exp.path, exp.client)} disabled={removeNfsExportMutation.loading} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Trash2 size={12} /> {removeNfsExportMutation.loading ? "..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add NFS Export form */}
          <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Add Export</h3>
            {addNfsExportMutation.error && (
              <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{addNfsExportMutation.error}</div>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Path</label>
                <input className={s.input} placeholder="/pool/dataset" value={newNfsPath} onChange={(e) => setNewNfsPath(e.target.value)} list="nfs-path-options" />
                <datalist id="nfs-path-options">
                  {datasets?.map((ds: DatasetSummary) => (
                    <option key={ds.name} value={ds.mountpoint || `/${ds.name}`} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Client</label>
                <input className={s.input} placeholder="192.168.1.0/24" value={newNfsClient} onChange={(e) => setNewNfsClient(e.target.value)} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Options</label>
                <input className={s.input} placeholder="rw,sync,no_subtree_check" value={newNfsOptions} onChange={(e) => setNewNfsOptions(e.target.value)} style={{ width: 220 }} />
              </div>
              <button className={s.btnPrimary} onClick={handleAddNfsExport} disabled={addNfsExportMutation.loading || !newNfsPath || !newNfsClient} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={14} />
                {addNfsExportMutation.loading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </AdvancedOptions>
      </div>

      {/* Samba Settings — collapsed */}
      <div className={s.card}>
        <AdvancedOptions label="Samba Settings">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Server String</label>
              <input className={s.input} style={{ width: "100%" }} placeholder="ZFS Manager Samba Server" value={sambaServerString} onChange={(e) => setSambaServerString(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Workgroup</label>
              <input className={s.input} style={{ width: "100%" }} placeholder="WORKGROUP" value={sambaWorkgroup} onChange={(e) => setSambaWorkgroup(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Log Level</label>
              <select className={s.select} style={{ width: "100%" }} value={sambaLogLevel} onChange={(e) => setSambaLogLevel(Number(e.target.value))}>
                <option value={0}>0 (minimal)</option>
                <option value={1}>1 (normal)</option>
                <option value={2}>2 (verbose)</option>
                <option value={3}>3 (debug)</option>
              </select>
            </div>
          </div>

          {saveSambaGlobalMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-3)" }}>{saveSambaGlobalMutation.error}</div>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
            <button className={s.btnPrimary} onClick={handleSaveSambaGlobal} disabled={saveSambaGlobalMutation.loading}>
              {saveSambaGlobalMutation.loading ? "Saving..." : "Save"}
            </button>
          </div>

          <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Configuration File</h3>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <button className={s.btnGhost} onClick={handleExportSambaConfig} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Download size={14} /> Export Config
              </button>
              <button className={s.btnGhost} onClick={() => setShowImportConfig(!showImportConfig)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Upload size={14} /> Import Config
              </button>
            </div>

            {showImportConfig && (
              <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)" }}>
                <div style={{ marginBottom: "var(--space-2)" }}>
                  <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upload a .conf file or paste contents below</label>
                  <input type="file" accept=".conf,.txt" onChange={handleImportFile} style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-xs)" }} />
                </div>
                <textarea className={s.input} style={{ width: "100%", minHeight: 120, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }} placeholder="Paste Samba config here..." value={importConfigText} onChange={(e) => setImportConfigText(e.target.value)} />
                {importSambaConfigMutation.error && (
                  <div className={s.error} style={{ marginTop: "var(--space-2)" }}>{importSambaConfigMutation.error}</div>
                )}
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  <button className={s.btnPrimary} onClick={handleImportSambaConfig} disabled={importSambaConfigMutation.loading || !importConfigText.trim()}>
                    {importSambaConfigMutation.loading ? "Importing..." : "Confirm Import"}
                  </button>
                  <button className={s.btnGhost} onClick={() => { setShowImportConfig(false); setImportConfigText(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </AdvancedOptions>
      </div>

      {/* Encryption Section */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Shield size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          Dataset Encryption
        </h2>

        {detailsLoading ? (
          <div className={s.loading}>Loading encryption details...</div>
        ) : encryptionDetails.length === 0 ? (
          <div className={s.empty}>
            <Lock size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No encrypted datasets found.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Dataset</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Encryption</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Key Status</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Key Format</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Key Location</th>
              </tr>
            </thead>
            <tbody>
              {encryptionDetails.map((enc) => (
                <tr key={enc.dataset} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={s.mono} style={{ padding: "var(--space-3)" }}>{enc.dataset}</td>
                  <td style={{ padding: "var(--space-3)" }}><span className={s.badgeMuted}>{enc.encryption}</span></td>
                  <td style={{ padding: "var(--space-3)" }}>
                    {enc.keystatus === "available" ? (
                      <span className={s.badgeSuccess}><Unlock size={10} style={{ marginRight: "4px" }} /> Available</span>
                    ) : (
                      <span className={s.badgeDanger}><Lock size={10} style={{ marginRight: "4px" }} /> Unavailable</span>
                    )}
                  </td>
                  <td className={s.mono} style={{ padding: "var(--space-3)" }}>{enc.keyformat}</td>
                  <td className={s.mono} style={{ padding: "var(--space-3)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>{enc.keylocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
