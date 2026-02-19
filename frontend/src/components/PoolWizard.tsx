import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  HardDrive,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { createPool, listDisks } from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import css from "./PoolWizard.module.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PoolWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type TopologyType = "stripe" | "mirror" | "raidz" | "raidz2" | "raidz3";

type Compression = "off" | "lz4" | "gzip" | "zstd";

type Ashift = "9" | "12" | "13";

interface DiskEntry {
  name: string;
  /** Stable /dev/disk/by-id/ path — preferred for pool creation */
  byId: string | null;
  size: string;
  model: string;
  mounted: boolean;
  hasFilesystem: boolean;
}

interface WizardState {
  /* Step 1 */
  poolName: string;
  mountpoint: string;
  force: boolean;
  /* Step 2 */
  selectedDisks: string[];
  /* Step 3 */
  topology: TopologyType;
  /* Step 4 */
  compression: Compression;
  ashift: Ashift;
  encryption: boolean;
  passphrase: string;
  passphraseConfirm: string;
}

const INITIAL_STATE: WizardState = {
  poolName: "",
  mountpoint: "",
  force: false,
  selectedDisks: [],
  topology: "stripe",
  compression: "lz4",
  ashift: "12",
  encryption: false,
  passphrase: "",
  passphraseConfirm: "",
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: "name", label: "Name" },
  { key: "disks", label: "Disks" },
  { key: "topology", label: "Topology" },
  { key: "properties", label: "Properties" },
  { key: "review", label: "Review" },
] as const;

interface TopologyOption {
  value: TopologyType;
  label: string;
  description: string;
  minDisks: number;
  redundancy: "none" | "low" | "medium" | "high";
  redundancyLabel: string;
}

const TOPOLOGY_OPTIONS: TopologyOption[] = [
  {
    value: "stripe",
    label: "Stripe (RAID 0)",
    description:
      "Maximum capacity and performance. No redundancy -- any disk failure causes total data loss.",
    minDisks: 1,
    redundancy: "none",
    redundancyLabel: "None",
  },
  {
    value: "mirror",
    label: "Mirror (RAID 1)",
    description:
      "All disks hold identical copies. Can survive N-1 disk failures. Usable space equals one disk.",
    minDisks: 2,
    redundancy: "high",
    redundancyLabel: "High",
  },
  {
    value: "raidz",
    label: "RAIDZ (RAID 5)",
    description:
      "Single-parity striping. Can survive one disk failure. Good balance of space and safety.",
    minDisks: 3,
    redundancy: "low",
    redundancyLabel: "Single parity",
  },
  {
    value: "raidz2",
    label: "RAIDZ2 (RAID 6)",
    description:
      "Double-parity striping. Can survive two simultaneous disk failures.",
    minDisks: 4,
    redundancy: "medium",
    redundancyLabel: "Double parity",
  },
  {
    value: "raidz3",
    label: "RAIDZ3",
    description:
      "Triple-parity striping. Can survive three simultaneous disk failures. Best data protection.",
    minDisks: 5,
    redundancy: "high",
    redundancyLabel: "Triple parity",
  },
];

const COMPRESSION_OPTIONS: { value: Compression; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "lz4", label: "LZ4 (recommended)" },
  { value: "gzip", label: "Gzip" },
  { value: "zstd", label: "Zstd" },
];

const ASHIFT_OPTIONS: { value: Ashift; label: string }[] = [
  { value: "9", label: "9 (512B sectors)" },
  { value: "12", label: "12 (4K sectors, recommended)" },
  { value: "13", label: "13 (8K sectors)" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseDisk(raw: Record<string, unknown>): DiskEntry {
  return {
    name: String(raw.name ?? raw.device ?? ""),
    byId: raw.by_id ? String(raw.by_id) : null,
    size: String(raw.size ?? raw.mediasize ?? "unknown"),
    model: String(raw.model ?? raw.description ?? raw.ident ?? "unknown"),
    mounted: Boolean(raw.mounted),
    hasFilesystem: Boolean(
      raw.filesystem || raw.fstype || raw.has_filesystem,
    ),
  };
}

/** Return the stable device path (by-id preferred, falls back to /dev/sdX). */
function stablePath(disk: DiskEntry): string {
  return disk.byId ?? disk.name;
}

function formatCapacity(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TiB`;
}

function redundancyClass(level: TopologyOption["redundancy"]): string {
  switch (level) {
    case "none":
      return css.redundancyNone;
    case "low":
      return css.redundancyLow;
    case "medium":
      return css.redundancyMedium;
    case "high":
      return css.redundancyHigh;
  }
}

function redundancyIcon(level: TopologyOption["redundancy"]) {
  switch (level) {
    case "none":
      return <ShieldAlert size={12} />;
    case "low":
      return <Shield size={12} />;
    case "medium":
      return <ShieldCheck size={12} />;
    case "high":
      return <ShieldCheck size={12} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function validateStep(step: number, state: WizardState): string | null {
  switch (step) {
    case 0: {
      if (!state.poolName.trim()) return "Pool name is required.";
      if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(state.poolName)) {
        return "Pool name must start with a letter and contain only letters, digits, hyphens, underscores, or dots.";
      }
      if (state.mountpoint && !state.mountpoint.startsWith("/")) {
        return "Mountpoint must be an absolute path starting with /.";
      }
      return null;
    }
    case 1: {
      if (state.selectedDisks.length === 0)
        return "Select at least one disk.";
      return null;
    }
    case 2: {
      const opt = TOPOLOGY_OPTIONS.find((t) => t.value === state.topology);
      if (opt && state.selectedDisks.length < opt.minDisks) {
        return `${opt.label} requires at least ${opt.minDisks} disk(s). You selected ${state.selectedDisks.length}.`;
      }
      return null;
    }
    case 3: {
      if (state.encryption) {
        if (state.passphrase.length < 8) {
          return "Passphrase must be at least 8 characters.";
        }
        if (state.passphrase !== state.passphraseConfirm) {
          return "Passphrases do not match.";
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components: Steps                                              */
/* ------------------------------------------------------------------ */

function StepName({
  state,
  update,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}) {
  return (
    <>
      <div className={css.fieldGroup}>
        <label className={css.fieldLabel} htmlFor="pw-pool-name">
          Pool Name
        </label>
        <input
          id="pw-pool-name"
          className={css.inputMono}
          type="text"
          value={state.poolName}
          onChange={(e) => update({ poolName: e.target.value })}
          placeholder="tank"
          autoFocus
        />
        <div className={css.fieldHint}>
          Must start with a letter. Allowed: letters, digits, hyphens,
          underscores, dots.
        </div>
      </div>

      <div className={css.fieldGroup}>
        <label className={css.fieldLabel} htmlFor="pw-mountpoint">
          Mountpoint (optional)
        </label>
        <input
          id="pw-mountpoint"
          className={css.inputMono}
          type="text"
          value={state.mountpoint}
          onChange={(e) => update({ mountpoint: e.target.value })}
          placeholder="/mnt/tank"
        />
        <div className={css.fieldHint}>
          Leave empty to use the ZFS default (/{"{poolname}"}).
        </div>
      </div>

      <div className={css.fieldGroup}>
        <label className={css.checkboxRow}>
          <input
            type="checkbox"
            checked={state.force}
            onChange={(e) => update({ force: e.target.checked })}
          />
          Force creation
        </label>
        <div className={css.fieldHint}>
          Skip certain safety checks (e.g., disks with existing partitions).
        </div>
      </div>
    </>
  );
}

function StepDisks({
  state,
  update,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}) {
  const {
    data: rawDisks,
    loading,
    error,
    refetch,
  } = useApi(() => listDisks(), []);

  const disks: DiskEntry[] = useMemo(() => {
    if (!rawDisks?.devices) return [];
    return (rawDisks.devices as Array<Record<string, unknown>>)
      .map(parseDisk)
      .filter((d) => !d.mounted && !d.hasFilesystem);
  }, [rawDisks]);

  const toggle = useCallback(
    (disk: DiskEntry) => {
      const id = stablePath(disk);
      update({
        selectedDisks: state.selectedDisks.includes(id)
          ? state.selectedDisks.filter((d) => d !== id)
          : [...state.selectedDisks, id],
      });
    },
    [state.selectedDisks, update],
  );

  if (loading) {
    return (
      <div className={css.diskLoading}>
        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        {" "}Loading available disks...
      </div>
    );
  }

  if (error) {
    return (
      <div className={css.diskError}>
        <AlertTriangle size={14} /> {error}
        <button className={css.btnBack} onClick={refetch} style={{ marginLeft: "var(--space-3)" }}>
          Retry
        </button>
      </div>
    );
  }

  if (disks.length === 0) {
    return (
      <div className={css.diskEmpty}>
        <HardDrive size={20} />
        <p>No available disks found.</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)" }}>
          Disks that are already mounted or have a filesystem are excluded.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={css.selectedCount}>
        {state.selectedDisks.length} of {disks.length} disk(s) selected
      </div>
      <div className={css.diskList}>
        {disks.map((disk) => {
          const id = stablePath(disk);
          const selected = state.selectedDisks.includes(id);
          return (
            <div
              key={id}
              className={selected ? css.diskItemSelected : css.diskItem}
              onClick={() => toggle(disk)}
            >
              <input
                type="checkbox"
                className={css.diskCheckbox}
                checked={selected}
                onChange={() => toggle(disk)}
                onClick={(e) => e.stopPropagation()}
              />
              <HardDrive size={16} />
              <div className={css.diskInfo}>
                <div className={css.diskName}>{disk.name}</div>
                <div className={css.diskMeta}>
                  <span>{disk.size}</span>
                  <span>{disk.model}</span>
                </div>
                {disk.byId && (
                  <div className={css.diskMeta} style={{ opacity: 0.6, fontSize: "var(--text-xs)" }}>
                    {disk.byId.replace("/dev/disk/by-id/", "")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

interface PresetCard {
  topology: TopologyType;
  label: string;
  description: string;
  icon: typeof Shield;
  minDisks: number;
  recommended?: boolean;
  /** Fraction of raw capacity that is usable (0-1) */
  usableFraction: (diskCount: number) => number;
}

const PRESETS: PresetCard[] = [
  {
    topology: "stripe",
    label: "Basic",
    description: "Maximum storage, no redundancy",
    icon: ShieldAlert,
    minDisks: 1,
    usableFraction: () => 1,
  },
  {
    topology: "mirror",
    label: "Protected",
    description: "Protects against 1 disk failure",
    icon: ShieldCheck,
    minDisks: 2,
    recommended: true,
    usableFraction: (n) => (n > 0 ? 1 / n : 0),
  },
  {
    topology: "raidz2",
    label: "Maximum Protection",
    description: "Protects against 2 disk failures",
    icon: Shield,
    minDisks: 4,
    usableFraction: (n) => (n > 2 ? (n - 2) / n : 0),
  },
];

function StepTopology({
  state,
  update,
  diskSizes,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  diskSizes: number[];
}) {
  const diskCount = state.selectedDisks.length;
  const [showCustom, setShowCustom] = useState(false);

  // Is current topology one of the presets?
  const isPreset = PRESETS.some((p) => p.topology === state.topology);

  // Compute total raw size from disk sizes
  const totalRaw = diskSizes.reduce((sum, s) => sum + s, 0);

  return (
    <>
      <div className={css.fieldHint} style={{ marginBottom: "var(--space-4)" }}>
        You selected <strong>{diskCount}</strong> disk(s). Choose a topology
        that fits your needs.
      </div>

      {/* Preset cards */}
      <div className={css.presetGrid}>
        {PRESETS.map((preset) => {
          const disabled = diskCount < preset.minDisks;
          const selected = state.topology === preset.topology && !disabled;
          const Icon = preset.icon;
          const usable = totalRaw * preset.usableFraction(diskCount);

          let cardClass = css.presetCard;
          if (disabled) cardClass = css.presetCardDisabled;
          else if (selected) cardClass = css.presetCardSelected;

          return (
            <div
              key={preset.topology}
              className={cardClass}
              onClick={() => {
                if (!disabled) {
                  update({ topology: preset.topology });
                  setShowCustom(false);
                }
              }}
            >
              <Icon size={24} />
              <div className={css.presetLabel}>
                {preset.label}
                {preset.recommended && (
                  <span className={css.presetRecommended}>Recommended</span>
                )}
              </div>
              <div className={css.presetDesc}>{preset.description}</div>
              {!disabled && totalRaw > 0 && (
                <div className={css.presetCapacity}>
                  ~{formatCapacity(usable)} usable
                </div>
              )}
              {disabled && (
                <div className={css.presetCapacity}>
                  Needs {preset.minDisks}+ disks
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom configuration toggle */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <button
          type="button"
          className={css.btnBack}
          onClick={() => setShowCustom((o) => !o)}
          style={{ fontSize: "var(--text-xs)" }}
        >
          {showCustom ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Custom configuration
        </button>
      </div>

      {(showCustom || (!isPreset && !PRESETS.some((p) => p.topology === state.topology))) && (
        <div className={css.topologyGrid} style={{ marginTop: "var(--space-3)" }}>
          {TOPOLOGY_OPTIONS.map((opt) => {
            const disabled = diskCount < opt.minDisks;
            const selected = state.topology === opt.value && !disabled;

            let className: string;
            if (disabled) {
              className = css.topologyOptionDisabled;
            } else if (selected) {
              className = css.topologyOptionSelected;
            } else {
              className = css.topologyOption;
            }

            return (
              <div
                key={opt.value}
                className={className}
                onClick={() => {
                  if (!disabled) update({ topology: opt.value });
                }}
              >
                <input
                  type="radio"
                  className={css.topologyRadio}
                  name="topology"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => {
                    if (!disabled) update({ topology: opt.value });
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className={css.topologyInfo}>
                  <div className={css.topologyName}>{opt.label}</div>
                  <div className={css.topologyDesc}>{opt.description}</div>
                  <div className={css.topologyMeta}>
                    <span className={css.tagMinDisks}>
                      Min {opt.minDisks} disk{opt.minDisks > 1 ? "s" : ""}
                    </span>
                    <span
                      className={`${css.tagRedundancy} ${redundancyClass(opt.redundancy)}`}
                    >
                      {redundancyIcon(opt.redundancy)} {opt.redundancyLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StepProperties({
  state,
  update,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}) {
  return (
    <>
      <div className={css.fieldGroup}>
        <label className={css.fieldLabel} htmlFor="pw-compression">
          Compression
        </label>
        <select
          id="pw-compression"
          className={css.select}
          value={state.compression}
          onChange={(e) =>
            update({ compression: e.target.value as Compression })
          }
        >
          {COMPRESSION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={css.fieldGroup}>
        <label className={css.fieldLabel} htmlFor="pw-ashift">
          Ashift (sector size)
        </label>
        <select
          id="pw-ashift"
          className={css.select}
          value={state.ashift}
          onChange={(e) => update({ ashift: e.target.value as Ashift })}
        >
          {ASHIFT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className={css.fieldHint}>
          Ashift 12 (4K sectors) is correct for most modern drives.
        </div>
      </div>

      <div className={css.fieldGroup}>
        <label className={css.checkboxRow}>
          <input
            type="checkbox"
            checked={state.encryption}
            onChange={(e) =>
              update({
                encryption: e.target.checked,
                passphrase: e.target.checked ? state.passphrase : "",
                passphraseConfirm: e.target.checked
                  ? state.passphraseConfirm
                  : "",
              })
            }
          />
          Enable encryption (aes-256-gcm)
        </label>
        <div className={css.fieldHint}>
          Encrypts all data at rest. Requires a passphrase to unlock the pool.
        </div>
      </div>

      {state.encryption && (
        <>
          <div className={css.fieldGroup}>
            <label className={css.fieldLabel} htmlFor="pw-passphrase">
              Passphrase
            </label>
            <input
              id="pw-passphrase"
              className={css.input}
              type="password"
              value={state.passphrase}
              onChange={(e) => update({ passphrase: e.target.value })}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className={css.fieldGroup}>
            <label className={css.fieldLabel} htmlFor="pw-passphrase-confirm">
              Confirm Passphrase
            </label>
            <input
              id="pw-passphrase-confirm"
              className={css.input}
              type="password"
              value={state.passphraseConfirm}
              onChange={(e) => update({ passphraseConfirm: e.target.value })}
              placeholder="Re-enter passphrase"
              autoComplete="new-password"
            />
            {state.passphraseConfirm.length > 0 &&
              state.passphrase !== state.passphraseConfirm && (
                <div className={css.validationMsg}>
                  Passphrases do not match.
                </div>
              )}
          </div>
        </>
      )}
    </>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const topoOption = TOPOLOGY_OPTIONS.find((t) => t.value === state.topology);

  return (
    <>
      {/* Pool basics */}
      <div className={css.reviewSection}>
        <div className={css.reviewHeading}>Pool Configuration</div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Name</span>
          <span className={css.reviewValue}>{state.poolName}</span>
        </div>
        {state.mountpoint && (
          <div className={css.reviewRow}>
            <span className={css.reviewLabel}>Mountpoint</span>
            <span className={css.reviewValue}>{state.mountpoint}</span>
          </div>
        )}
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Force</span>
          <span className={css.reviewValue}>
            {state.force ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {/* Disks */}
      <div className={css.reviewSection}>
        <div className={css.reviewHeading}>
          Disks ({state.selectedDisks.length})
        </div>
        <div className={css.reviewDiskList}>
          {state.selectedDisks.map((d) => (
            <span key={d} className={css.reviewDiskChip}>
              <HardDrive size={10} /> {d}
            </span>
          ))}
        </div>
      </div>

      {/* Topology */}
      <div className={css.reviewSection}>
        <div className={css.reviewHeading}>Topology</div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Type</span>
          <span className={css.reviewValue}>
            {topoOption?.label ?? state.topology}
          </span>
        </div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Redundancy</span>
          <span className={css.reviewValue}>
            {topoOption?.redundancyLabel ?? "--"}
          </span>
        </div>
      </div>

      {/* Properties */}
      <div className={css.reviewSection}>
        <div className={css.reviewHeading}>Properties</div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Compression</span>
          <span className={css.reviewValue}>{state.compression}</span>
        </div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Ashift</span>
          <span className={css.reviewValue}>{state.ashift}</span>
        </div>
        <div className={css.reviewRow}>
          <span className={css.reviewLabel}>Encryption</span>
          <span className={css.reviewValue}>
            {state.encryption ? "aes-256-gcm" : "Off"}
          </span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Wizard Component                                              */
/* ------------------------------------------------------------------ */

export function PoolWizard({
  open,
  onClose,
  onCreated,
}: PoolWizardProps): JSX.Element | null {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [validationError, setValidationError] = useState<string | null>(null);

  /* Reset when dialog opens */
  useEffect(() => {
    if (open) {
      setStep(0);
      setState(INITIAL_STATE);
      setValidationError(null);
    }
  }, [open]);

  const update = useCallback(
    (patch: Partial<WizardState>) => {
      setState((prev) => ({ ...prev, ...patch }));
      setValidationError(null);
    },
    [],
  );

  /* Build the vdevs array for the API */
  const buildVdevs = useCallback((): string[] => {
    if (state.topology === "stripe") {
      return state.selectedDisks;
    }
    return [state.topology, ...state.selectedDisks];
  }, [state.topology, state.selectedDisks]);

  /* Mutation */
  const createMut = useMutation(async () => {
    const properties: Record<string, string> = {
      ashift: state.ashift,
    };

    const fsProperties: Record<string, string> = {};

    if (state.compression !== "off") {
      fsProperties.compression = state.compression;
    }

    if (state.encryption) {
      properties.encryption = "aes-256-gcm";
      properties.keyformat = "passphrase";
      properties.keylocation = "prompt";
    }

    return createPool({
      name: state.poolName,
      vdevs: buildVdevs(),
      force: state.force || undefined,
      mountpoint: state.mountpoint || undefined,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
      fs_properties:
        Object.keys(fsProperties).length > 0 ? fsProperties : undefined,
    });
  });

  /* Navigation */
  const canGoNext = useCallback((): boolean => {
    return validateStep(step, state) === null;
  }, [step, state]);

  const goNext = useCallback(() => {
    const err = validateStep(step, state);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);

    /* If the topology is no longer valid after changing disks, reset to stripe */
    if (step === 1) {
      const currentOpt = TOPOLOGY_OPTIONS.find(
        (t) => t.value === state.topology,
      );
      if (currentOpt && state.selectedDisks.length < currentOpt.minDisks) {
        setState((prev) => ({ ...prev, topology: "stripe" }));
      }
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, state]);

  const goBack = useCallback(() => {
    setValidationError(null);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleCreate = useCallback(async () => {
    const result = await createMut.execute();
    if (result) {
      onCreated();
      onClose();
    }
  }, [createMut, onCreated, onClose]);

  /* Don't render when closed */
  if (!open) return null;

  /* Render the current step body */
  const renderStep = () => {
    switch (step) {
      case 0:
        return <StepName state={state} update={update} />;
      case 1:
        return <StepDisks state={state} update={update} />;
      case 2:
        return <StepTopology state={state} update={update} diskSizes={[]} />;
      case 3:
        return <StepProperties state={state} update={update} />;
      case 4:
        return <StepReview state={state} />;
      default:
        return null;
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className={css.overlay} onClick={onClose}>
      <div className={css.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={css.dialogHeader}>
          <span className={css.dialogTitle}>Create Pool</span>
          <button
            className={css.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className={css.stepIndicator}>
          {STEPS.map((s, i) => {
            const isDone = i < step;
            const isActive = i === step;

            let circleClass = css.stepCircleDefault;
            if (isActive) circleClass = css.stepCircleActive;
            else if (isDone) circleClass = css.stepCircleDone;

            let labelClass = css.stepLabel;
            if (isActive) labelClass = css.stepLabelActive;
            else if (isDone) labelClass = css.stepLabelDone;

            return (
              <div key={s.key} className={css.stepItem}>
                {i > 0 && <div className={css.stepDivider} />}
                <span className={circleClass}>
                  {isDone ? <Check size={12} /> : i + 1}
                </span>
                <span className={labelClass}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className={css.body}>
          {/* Mutation error */}
          {createMut.error && (
            <div className={css.errorBanner}>
              <AlertTriangle size={14} />
              {createMut.error}
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <div className={css.errorBanner}>
              <AlertTriangle size={14} />
              {validationError}
            </div>
          )}

          {renderStep()}
        </div>

        {/* Footer */}
        <div className={css.footer}>
          <div className={css.footerLeft}>
            <button className={css.btnCancel} onClick={onClose}>
              Cancel
            </button>
          </div>
          <div className={css.footerRight}>
            {step > 0 && (
              <button className={css.btnBack} onClick={goBack}>
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {isLastStep ? (
              <button
                className={css.btnCreate}
                onClick={handleCreate}
                disabled={createMut.loading}
              >
                {createMut.loading ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Create Pool
                  </>
                )}
              </button>
            ) : (
              <button
                className={css.btnNext}
                onClick={goNext}
                disabled={!canGoNext()}
              >
                Next <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
