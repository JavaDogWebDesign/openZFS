import { FormEvent, useCallback, useState } from "react";
import {
  Bookmark,
  Camera,
  ChevronDown,
  Clock,
  Copy,
  GitBranch,
  Lock,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import {
  listDatasets,
  listSnapshots,
  createSnapshot,
  destroySnapshot,
  rollbackSnapshot,
  cloneSnapshot,
  diffSnapshots,
  holdSnapshot,
  releaseHold,
  listHolds,
  listBookmarks,
  createBookmark,
  type DatasetSummary,
  type SnapshotSummary,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
import styles from "@/styles/views.module.css";

interface DiffEntry {
  change_type: string;
  path: string;
  new_path?: string;
}

interface HoldEntry {
  name: string;
  tag: string;
  timestamp: string;
}

interface BookmarkEntry {
  name: string;
  creation: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

function getSnapshotShortName(fullName: string): string {
  const atIdx = fullName.indexOf("@");
  return atIdx >= 0 ? fullName.slice(atIdx + 1) : fullName;
}

function diffChangeTypeBadge(changeType: string): string {
  switch (changeType.toUpperCase()) {
    case "M":
    case "MODIFIED":
      return styles.badgeWarning;
    case "+":
    case "ADDED":
      return styles.badgeSuccess;
    case "-":
    case "REMOVED":
      return styles.badgeDanger;
    case "R":
    case "RENAMED":
      return styles.badgeMuted;
    default:
      return styles.badgeMuted;
  }
}

export function Snapshots() {
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRecursive, setCreateRecursive] = useState(false);

  // Confirm dialogs
  const [destroyTarget, setDestroyTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  // Clone state
  const [cloneSource, setCloneSource] = useState<string | null>(null);
  const [cloneTarget, setCloneTarget] = useState("");

  // Hold state
  const [holdSource, setHoldSource] = useState<string | null>(null);
  const [holdTag, setHoldTag] = useState("keep");

  // Holds viewer state
  const [holdsSnap, setHoldsSnap] = useState<string | null>(null);

  // Bookmarks state
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [newBookmarkSnap, setNewBookmarkSnap] = useState("");
  const [newBookmarkName, setNewBookmarkName] = useState("");

  // Diff state
  const [diffSnapA, setDiffSnapA] = useState<string>("");
  const [diffSnapB, setDiffSnapB] = useState<string>("");
  const [diffResults, setDiffResults] = useState<DiffEntry[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const { addToast } = useToast();

  // --- Data fetching ---

  const {
    data: datasets,
    loading: datasetsLoading,
  } = useApi<DatasetSummary[]>(() => listDatasets(), []);

  const {
    data: snapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
    refetch: refetchSnapshots,
  } = useApi<SnapshotSummary[]>(
    () =>
      selectedDataset
        ? listSnapshots(selectedDataset)
        : Promise.resolve([] as SnapshotSummary[]),
    [selectedDataset],
  );

  // Holds fetching
  const {
    data: holds,
    loading: holdsLoading,
    error: holdsError,
    refetch: refetchHolds,
  } = useApi<HoldEntry[]>(
    () =>
      holdsSnap
        ? listHolds(holdsSnap)
        : Promise.resolve([] as HoldEntry[]),
    [holdsSnap],
  );

  // Bookmarks fetching
  const {
    data: bookmarks,
    loading: bookmarksLoading,
    error: bookmarksError,
    refetch: refetchBookmarks,
  } = useApi<BookmarkEntry[]>(
    () =>
      selectedDataset && showBookmarks
        ? listBookmarks(selectedDataset)
        : Promise.resolve([] as BookmarkEntry[]),
    [selectedDataset, showBookmarks],
  );

  // --- Mutations ---

  const createMut = useMutation(
    (dataset: string, name: string, recursive: boolean) =>
      createSnapshot(dataset, name, recursive),
  );

  const destroyMut = useMutation((snapshot: string) =>
    destroySnapshot(snapshot, snapshot),
  );

  const rollbackMut = useMutation((snapshot: string) =>
    rollbackSnapshot(snapshot, snapshot, false),
  );

  const cloneMut = useMutation((snapshot: string, target: string) =>
    cloneSnapshot(snapshot, target),
  );

  const holdMut = useMutation((snapshot: string, tag: string) =>
    holdSnapshot(snapshot, tag),
  );

  const releaseHoldMut = useMutation((snapshot: string, tag: string) =>
    releaseHold(snapshot, tag),
  );

  const createBookmarkMut = useMutation((snapshot: string, name: string) =>
    createBookmark(snapshot, name),
  );

  // --- Handlers ---

  const handleDatasetChange = useCallback((value: string) => {
    setSelectedDataset(value);
    setDiffSnapA("");
    setDiffSnapB("");
    setDiffResults(null);
    setDiffError(null);
    setHoldsSnap(null);
    setShowBookmarks(false);
  }, []);

  const handleCreateSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedDataset || !createName) return;
      const result = await createMut.execute(
        selectedDataset,
        createName,
        createRecursive,
      );
      if (result) {
        addToast("success", `Snapshot ${createName} created`);
        setCreateName("");
        setCreateRecursive(false);
        setShowCreateForm(false);
        refetchSnapshots();
      }
    },
    [selectedDataset, createName, createRecursive, createMut, refetchSnapshots],
  );

  const handleDestroy = useCallback(async () => {
    if (!destroyTarget) return;
    const result = await destroyMut.execute(destroyTarget);
    if (result) {
      addToast("success", "Snapshot destroyed");
      setDestroyTarget(null);
      refetchSnapshots();
    }
  }, [destroyTarget, destroyMut, refetchSnapshots, addToast]);

  const handleRollback = useCallback(async () => {
    if (!rollbackTarget) return;
    const result = await rollbackMut.execute(rollbackTarget);
    if (result) {
      addToast("success", "Rollback complete");
      setRollbackTarget(null);
      refetchSnapshots();
    }
  }, [rollbackTarget, rollbackMut, refetchSnapshots, addToast]);

  const handleClone = useCallback(async () => {
    if (!cloneSource || !cloneTarget) return;
    const result = await cloneMut.execute(cloneSource, cloneTarget);
    if (result) {
      addToast("success", "Snapshot cloned successfully");
      setCloneSource(null);
      setCloneTarget("");
    } else if (cloneMut.error) {
      addToast("error", cloneMut.error);
    }
  }, [cloneSource, cloneTarget, cloneMut, addToast]);

  const handleHold = useCallback(async () => {
    if (!holdSource || !holdTag) return;
    const result = await holdMut.execute(holdSource, holdTag);
    if (result) {
      addToast("success", "Hold placed on snapshot");
      setHoldSource(null);
      setHoldTag("keep");
    } else if (holdMut.error) {
      addToast("error", holdMut.error);
    }
  }, [holdSource, holdTag, holdMut, addToast]);

  const handleReleaseHold = useCallback(
    async (snapshot: string, tag: string) => {
      const result = await releaseHoldMut.execute(snapshot, tag);
      if (result) {
        addToast("success", `Hold "${tag}" released`);
        refetchHolds();
      } else if (releaseHoldMut.error) {
        addToast("error", releaseHoldMut.error);
      }
    },
    [releaseHoldMut, refetchHolds, addToast],
  );

  const handleCreateBookmark = useCallback(async () => {
    if (!newBookmarkSnap || !newBookmarkName) return;
    const result = await createBookmarkMut.execute(newBookmarkSnap, newBookmarkName);
    if (result) {
      addToast("success", `Bookmark "${newBookmarkName}" created`);
      setNewBookmarkSnap("");
      setNewBookmarkName("");
      refetchBookmarks();
    } else if (createBookmarkMut.error) {
      addToast("error", createBookmarkMut.error);
    }
  }, [newBookmarkSnap, newBookmarkName, createBookmarkMut, refetchBookmarks, addToast]);

  const handleDiff = useCallback(async () => {
    if (!diffSnapA || !diffSnapB) return;
    setDiffLoading(true);
    setDiffError(null);
    setDiffResults(null);
    try {
      const results = await diffSnapshots(diffSnapA, diffSnapB);
      setDiffResults(results);
    } catch (err) {
      setDiffError(
        err instanceof Error ? err.message : "Failed to compute diff",
      );
    } finally {
      setDiffLoading(false);
    }
  }, [diffSnapA, diffSnapB]);

  // --- Render helpers ---

  const renderCreateForm = () => {
    if (!showCreateForm) return null;

    return (
      <div className={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-3)",
          }}
        >
          <div className={styles.cardTitle}>Create Snapshot</div>
          <button
            className={styles.btnGhost}
            onClick={() => setShowCreateForm(false)}
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
              Snapshot Name *
            </label>
            <input
              className={styles.select}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. daily-2024-01-15"
              required
              autoFocus
            />
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
                marginTop: "var(--space-1)",
              }}
            >
              Full name: {selectedDataset}@{createName || "..."}
            </div>
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={createRecursive}
                onChange={(e) => setCreateRecursive(e.target.checked)}
              />
              Recursive (include child datasets)
            </label>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setShowCreateForm(false)}
              disabled={createMut.loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={createMut.loading || !createName}
            >
              <Camera size={14} />
              {createMut.loading ? "Creating..." : "Create Snapshot"}
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderCloneModal = () => {
    if (!cloneSource) return null;

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
        onClick={() => setCloneSource(null)}
      >
        <div
          className={styles.card}
          style={{ width: 420, margin: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.cardTitle}>Clone Snapshot</div>
          <p
            style={{
              fontSize: "var(--text-sm)",
              marginBottom: "var(--space-3)",
              color: "var(--color-text-muted)",
            }}
          >
            Create a new dataset from snapshot{" "}
            <span className={styles.mono}>
              {getSnapshotShortName(cloneSource)}
            </span>
          </p>

          {cloneMut.error && (
            <div className={styles.error}>{cloneMut.error}</div>
          )}

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                marginBottom: "var(--space-1)",
              }}
            >
              Target Dataset Name *
            </label>
            <input
              className={styles.select}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={cloneTarget}
              onChange={(e) => setCloneTarget(e.target.value)}
              placeholder="pool/cloned-dataset"
              autoFocus
            />
          </div>

          <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
            <button
              className={styles.btnGhost}
              onClick={() => setCloneSource(null)}
              disabled={cloneMut.loading}
            >
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={handleClone}
              disabled={cloneMut.loading || !cloneTarget}
            >
              <Copy size={14} />
              {cloneMut.loading ? "Cloning..." : "Clone"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderHoldModal = () => {
    if (!holdSource) return null;

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
        onClick={() => setHoldSource(null)}
      >
        <div
          className={styles.card}
          style={{ width: 380, margin: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.cardTitle}>Hold Snapshot</div>
          <p
            style={{
              fontSize: "var(--text-sm)",
              marginBottom: "var(--space-3)",
              color: "var(--color-text-muted)",
            }}
          >
            Prevent{" "}
            <span className={styles.mono}>
              {getSnapshotShortName(holdSource)}
            </span>{" "}
            from being destroyed.
          </p>

          {holdMut.error && (
            <div className={styles.error}>{holdMut.error}</div>
          )}

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                marginBottom: "var(--space-1)",
              }}
            >
              Hold Tag *
            </label>
            <input
              className={styles.select}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={holdTag}
              onChange={(e) => setHoldTag(e.target.value)}
              placeholder="e.g. keep"
              autoFocus
            />
          </div>

          <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
            <button
              className={styles.btnGhost}
              onClick={() => setHoldSource(null)}
              disabled={holdMut.loading}
            >
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={handleHold}
              disabled={holdMut.loading || !holdTag}
            >
              <Lock size={14} />
              {holdMut.loading ? "Holding..." : "Hold"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderHoldsPanel = () => {
    if (!holdsSnap) return null;

    return (
      <div className={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-3)",
          }}
        >
          <div className={styles.cardTitle}>
            <Shield
              size={16}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}
            />
            Holds for {getSnapshotShortName(holdsSnap)}
          </div>
          <button
            className={styles.btnGhost}
            onClick={() => setHoldsSnap(null)}
            style={{ padding: "var(--space-1)" }}
          >
            <X size={16} />
          </button>
        </div>

        {holdsLoading && (
          <div className={styles.loading}>Loading holds...</div>
        )}

        {holdsError && <div className={styles.error}>{holdsError}</div>}

        {!holdsLoading && holds && holds.length === 0 && (
          <div className={styles.empty} style={{ padding: "var(--space-4)" }}>
            No holds on this snapshot
          </div>
        )}

        {!holdsLoading && holds && holds.length > 0 && (
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {holds.map((hold) => (
              <div
                key={hold.tag}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-2) var(--space-3)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div>
                  <span
                    className={styles.mono}
                    style={{ fontWeight: 500 }}
                  >
                    {hold.tag}
                  </span>
                  {hold.timestamp && (
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                        marginLeft: "var(--space-2)",
                      }}
                    >
                      {formatDate(hold.timestamp)}
                    </span>
                  )}
                </div>
                <button
                  className={styles.btnDanger}
                  style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                  onClick={() => handleReleaseHold(holdsSnap, hold.tag)}
                  disabled={releaseHoldMut.loading}
                  title="Release this hold"
                >
                  {releaseHoldMut.loading ? "Releasing..." : "Release"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBookmarksSection = () => {
    if (!selectedDataset || !showBookmarks) return null;

    return (
      <div className={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-3)",
          }}
        >
          <div className={styles.cardTitle}>
            <Bookmark
              size={16}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}
            />
            Bookmarks
          </div>
          <button
            className={styles.btnGhost}
            onClick={() => setShowBookmarks(false)}
            style={{ padding: "var(--space-1)" }}
          >
            <X size={16} />
          </button>
        </div>

        {bookmarksLoading && (
          <div className={styles.loading}>Loading bookmarks...</div>
        )}

        {bookmarksError && <div className={styles.error}>{bookmarksError}</div>}

        {!bookmarksLoading && bookmarks && bookmarks.length === 0 && (
          <div className={styles.empty} style={{ padding: "var(--space-4)" }}>
            No bookmarks for this dataset
          </div>
        )}

        {!bookmarksLoading && bookmarks && bookmarks.length > 0 && (
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "var(--space-3)",
            }}
          >
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
                    Name
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Creation
                  </th>
                </tr>
              </thead>
              <tbody>
                {bookmarks.map((bm) => (
                  <tr
                    key={bm.name}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td
                      className={styles.mono}
                      style={{ padding: "var(--space-2)" }}
                    >
                      <Bookmark
                        size={12}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 4,
                          opacity: 0.5,
                        }}
                      />
                      {bm.name}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-2)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      {formatDate(bm.creation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create bookmark form */}
        {snapshots && snapshots.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: "var(--space-3)",
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                marginBottom: "var(--space-2)",
              }}
            >
              Create Bookmark from Snapshot
            </div>

            {createBookmarkMut.error && (
              <div className={styles.error}>{createBookmarkMut.error}</div>
            )}

            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "end",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    marginBottom: "var(--space-1)",
                  }}
                >
                  Source Snapshot
                </label>
                <select
                  className={styles.select}
                  style={{ width: "100%" }}
                  value={newBookmarkSnap}
                  onChange={(e) => setNewBookmarkSnap(e.target.value)}
                >
                  <option value="">Select snapshot...</option>
                  {snapshots.map((s) => (
                    <option key={s.name} value={s.name}>
                      {getSnapshotShortName(s.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    marginBottom: "var(--space-1)",
                  }}
                >
                  Bookmark Name
                </label>
                <input
                  className={styles.select}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={newBookmarkName}
                  onChange={(e) => setNewBookmarkName(e.target.value)}
                  placeholder="e.g. pre-upgrade"
                />
              </div>
              <button
                className={styles.btnPrimary}
                onClick={handleCreateBookmark}
                disabled={
                  createBookmarkMut.loading ||
                  !newBookmarkSnap ||
                  !newBookmarkName
                }
              >
                <Bookmark size={14} />
                {createBookmarkMut.loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDiffSection = () => {
    if (!snapshots || snapshots.length < 2) return null;

    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <GitBranch
            size={16}
            style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}
          />
          Snapshot Diff
        </div>

        <div
          className={styles.grid3}
          style={{ marginBottom: "var(--space-3)", alignItems: "end" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                marginBottom: "var(--space-1)",
              }}
            >
              From Snapshot
            </label>
            <select
              className={styles.select}
              style={{ width: "100%" }}
              value={diffSnapA}
              onChange={(e) => {
                setDiffSnapA(e.target.value);
                setDiffResults(null);
              }}
            >
              <option value="">Select snapshot...</option>
              {snapshots.map((s) => (
                <option key={s.name} value={s.name}>
                  {getSnapshotShortName(s.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                marginBottom: "var(--space-1)",
              }}
            >
              To Snapshot
            </label>
            <select
              className={styles.select}
              style={{ width: "100%" }}
              value={diffSnapB}
              onChange={(e) => {
                setDiffSnapB(e.target.value);
                setDiffResults(null);
              }}
            >
              <option value="">Select snapshot...</option>
              {snapshots
                .filter((s) => s.name !== diffSnapA)
                .map((s) => (
                  <option key={s.name} value={s.name}>
                    {getSnapshotShortName(s.name)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <button
              className={styles.btnPrimary}
              onClick={handleDiff}
              disabled={!diffSnapA || !diffSnapB || diffLoading}
              style={{ width: "100%" }}
            >
              {diffLoading ? "Computing..." : "Compare"}
            </button>
          </div>
        </div>

        {diffError && <div className={styles.error}>{diffError}</div>}

        {diffResults && diffResults.length === 0 && (
          <div className={styles.empty}>No differences found</div>
        )}

        {diffResults && diffResults.length > 0 && (
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    textAlign: "left",
                    position: "sticky",
                    top: 0,
                    background: "var(--color-bg-raised)",
                  }}
                >
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                      width: 80,
                    }}
                  >
                    Change
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Path
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffResults.map((entry, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td style={{ padding: "var(--space-2)" }}>
                      <span className={diffChangeTypeBadge(entry.change_type)}>
                        {entry.change_type}
                      </span>
                    </td>
                    <td
                      className={styles.mono}
                      style={{ padding: "var(--space-2)" }}
                    >
                      {entry.path}
                      {entry.new_path && (
                        <span
                          style={{
                            color: "var(--color-text-muted)",
                            marginLeft: "var(--space-2)",
                          }}
                        >
                          -&gt; {entry.new_path}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // --- Main render ---

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Snapshots</h1>
        <div className={styles.actions}>
          {selectedDataset && (
            <>
              <button
                className={styles.btnGhost}
                onClick={() => setShowBookmarks((v) => !v)}
                title="View and manage bookmarks for this dataset"
              >
                <Bookmark size={16} />
                Bookmarks
              </button>
              <button
                className={styles.btnPrimary}
                onClick={() => setShowCreateForm((v) => !v)}
              >
                <Plus size={16} />
                Create Snapshot
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dataset selector */}
      <div className={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <label
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Dataset:
          </label>
          <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
            <select
              className={styles.select}
              style={{ width: "100%", paddingRight: "var(--space-8)" }}
              value={selectedDataset}
              onChange={(e) => handleDatasetChange(e.target.value)}
              disabled={datasetsLoading}
            >
              <option value="">
                {datasetsLoading ? "Loading datasets..." : "Select a dataset..."}
              </option>
              {datasets?.map((ds) => (
                <option key={ds.name} value={ds.name}>
                  {ds.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{
                position: "absolute",
                right: "var(--space-2)",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.5,
              }}
            />
          </div>
        </div>
      </div>

      {/* Create snapshot form */}
      {renderCreateForm()}

      {/* No dataset selected */}
      {!selectedDataset && (
        <div className={styles.empty}>
          <Camera
            size={32}
            style={{ marginBottom: 8, opacity: 0.4 }}
          />
          <div>Select a dataset to view its snapshots</div>
        </div>
      )}

      {/* Loading */}
      {selectedDataset && snapshotsLoading && (
        <div className={styles.loading}>Loading snapshots...</div>
      )}

      {/* Error */}
      {snapshotsError && <div className={styles.error}>{snapshotsError}</div>}

      {/* Empty state */}
      {selectedDataset &&
        !snapshotsLoading &&
        snapshots &&
        snapshots.length === 0 && (
          <div className={styles.empty}>
            <Camera
              size={32}
              style={{ marginBottom: 8, opacity: 0.4 }}
            />
            <div>No snapshots for this dataset</div>
            <button
              className={styles.btnPrimary}
              style={{ marginTop: "var(--space-3)" }}
              onClick={() => setShowCreateForm(true)}
            >
              <Plus size={14} />
              Create First Snapshot
            </button>
          </div>
        )}

      {/* Snapshots table */}
      {selectedDataset &&
        !snapshotsLoading &&
        snapshots &&
        snapshots.length > 0 && (
          <div
            className={styles.card}
            style={{ padding: 0, overflow: "hidden" }}
          >
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
                    }}
                  >
                    Creation
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
                    Refer
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr
                    key={snap.name}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--color-bg-surface)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    <td
                      className={styles.mono}
                      style={{ padding: "var(--space-2) var(--space-3)" }}
                    >
                      <Camera
                        size={14}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 6,
                          opacity: 0.5,
                        }}
                      />
                      {getSnapshotShortName(snap.name)}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <Clock
                        size={12}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 4,
                          opacity: 0.5,
                        }}
                      />
                      {formatDate(snap.creation)}
                    </td>
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      {formatBytes(Number(snap.used))}
                    </td>
                    <td
                      className={styles.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      {formatBytes(Number(snap.refer))}
                    </td>
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "var(--space-1)",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className={styles.btnGhost}
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() => setRollbackTarget(snap.name)}
                          title="Revert this dataset to the state at this snapshot. Data written after this snapshot will be lost."
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          className={styles.btnGhost}
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() => {
                            setCloneSource(snap.name);
                            setCloneTarget("");
                          }}
                          title="Create a new dataset from this snapshot. The clone shares data blocks with the original."
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className={styles.btnGhost}
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() => setHoldsSnap(snap.name)}
                          title="View holds on this snapshot"
                        >
                          <Shield size={14} />
                        </button>
                        <button
                          className={styles.btnGhost}
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() => {
                            setHoldSource(snap.name);
                            setHoldTag("keep");
                          }}
                          title="Prevent this snapshot from being destroyed. Useful for protecting important snapshots."
                        >
                          <Lock size={14} />
                        </button>
                        <button
                          className={styles.btnDanger}
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() => setDestroyTarget(snap.name)}
                          title="Permanently delete this snapshot. This cannot be undone."
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Holds panel */}
      {renderHoldsPanel()}

      {/* Diff section */}
      {renderDiffSection()}

      {/* Bookmarks section */}
      {renderBookmarksSection()}

      {/* Clone modal */}
      {renderCloneModal()}

      {/* Hold modal */}
      {renderHoldModal()}

      {/* Destroy confirm dialog */}
      {destroyTarget && (
        <ConfirmDialog
          title="Destroy Snapshot"
          message={`This will permanently destroy the snapshot "${getSnapshotShortName(destroyTarget)}". This action cannot be undone.`}
          confirmValue={destroyTarget}
          confirmLabel="Destroy"
          onConfirm={handleDestroy}
          onCancel={() => setDestroyTarget(null)}
          loading={destroyMut.loading}
        />
      )}

      {/* Rollback confirm dialog */}
      {rollbackTarget && (
        <ConfirmDialog
          title="Rollback to Snapshot"
          message={`This will rollback the dataset to snapshot "${getSnapshotShortName(rollbackTarget)}". Any data written after this snapshot was taken will be lost.`}
          confirmValue={rollbackTarget}
          confirmLabel="Rollback"
          onConfirm={handleRollback}
          onCancel={() => setRollbackTarget(null)}
          loading={rollbackMut.loading}
        />
      )}
    </div>
  );
}
