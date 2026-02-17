import { useCallback, useState } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  HardDrive,
  Scissors,
  LogOut,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  listPools,
  getPool,
  scrubPool,
  trimPool,
  exportPool,
  destroyPool,
  type PoolSummary,
  type PoolDetail,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PoolWizard } from "@/components/PoolWizard";
import { DeviceTree } from "@/components/DeviceTree";
import css from "@/styles/views.module.css";

/* ---------- Helpers ---------- */

function healthBadge(health: string): string {
  switch (health.toUpperCase()) {
    case "ONLINE":
      return css.badgeSuccess;
    case "DEGRADED":
      return css.badgeWarning;
    case "FAULTED":
    case "UNAVAIL":
    case "REMOVED":
      return css.badgeDanger;
    default:
      return css.badgeMuted;
  }
}

/* ---------- Sub-components ---------- */

interface PropertyPanelProps {
  properties: Record<string, { value: string; source: string }>;
}

function PropertyPanel({ properties }: PropertyPanelProps): JSX.Element {
  const [filter, setFilter] = useState("");
  const entries = Object.entries(properties).filter(
    ([key, prop]) =>
      filter === "" ||
      key.toLowerCase().includes(filter.toLowerCase()) ||
      prop.value.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div style={{ marginBottom: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <Search size={14} />
        <input
          className={css.select}
          type="text"
          placeholder="Filter properties..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "var(--space-2)", fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                Property
              </th>
              <th style={{ textAlign: "left", padding: "var(--space-2)", fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                Value
              </th>
              <th style={{ textAlign: "left", padding: "var(--space-2)", fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={3} className={css.empty}>
                  No matching properties.
                </td>
              </tr>
            ) : (
              entries.map(([key, prop]) => (
                <tr key={key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={css.mono} style={{ padding: "var(--space-2)" }}>
                    {key}
                  </td>
                  <td className={css.mono} style={{ padding: "var(--space-2)" }}>
                    {prop.value}
                  </td>
                  <td style={{ padding: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                    {prop.source}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Main component ---------- */

export function Pools(): JSX.Element {
  const { data: pools, loading, error, refetch } = useApi(() => listPools());

  /* Selected pool detail */
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const {
    data: poolDetail,
    loading: detailLoading,
    error: detailError,
  } = useApi<PoolDetail | null>(
    () => (selectedPool ? getPool(selectedPool) : Promise.resolve(null)),
    [selectedPool],
  );

  /* Mutations */
  const scrubMut = useMutation((name: string) => scrubPool(name));
  const trimMut = useMutation((name: string) => trimPool(name));
  const exportMut = useMutation((name: string) => exportPool(name));
  const destroyMut = useMutation((name: string) => destroyPool(name, name));

  /* Pool wizard */
  const [wizardOpen, setWizardOpen] = useState(false);

  /* Confirm dialog state */
  const [confirmTarget, setConfirmTarget] = useState<{
    action: "export" | "destroy";
    pool: string;
  } | null>(null);

  /* Handlers */
  const handleScrub = useCallback(
    async (name: string) => {
      const result = await scrubMut.execute(name);
      if (result) refetch();
    },
    [scrubMut, refetch],
  );

  const handleTrim = useCallback(
    async (name: string) => {
      const result = await trimMut.execute(name);
      if (result) refetch();
    },
    [trimMut, refetch],
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmTarget) return;

    if (confirmTarget.action === "export") {
      const result = await exportMut.execute(confirmTarget.pool);
      if (result) {
        setSelectedPool(null);
        refetch();
      }
    } else if (confirmTarget.action === "destroy") {
      const result = await destroyMut.execute(confirmTarget.pool);
      if (result) {
        setSelectedPool(null);
        refetch();
      }
    }
    setConfirmTarget(null);
  }, [confirmTarget, exportMut, destroyMut, refetch]);

  const handleSelectPool = useCallback((name: string) => {
    setSelectedPool((prev) => (prev === name ? null : name));
  }, []);

  /* ---------- Render ---------- */

  if (loading) {
    return <div className={css.loading}>Loading pools...</div>;
  }

  if (error) {
    return (
      <div className={css.error}>
        <p>{error}</p>
        <button className={css.btnGhost} onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className={css.header}>
        <h1 className={css.title}>Pools</h1>
        <div className={css.actions}>
          <button className={css.btnGhost} onClick={refetch}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className={css.btnPrimary} onClick={() => setWizardOpen(true)}>
            <Plus size={14} /> Create Pool
          </button>
        </div>
      </div>

      {/* Mutation-level errors */}
      {scrubMut.error && <div className={css.error}>{scrubMut.error}</div>}
      {trimMut.error && <div className={css.error}>{trimMut.error}</div>}
      {exportMut.error && <div className={css.error}>{exportMut.error}</div>}
      {destroyMut.error && <div className={css.error}>{destroyMut.error}</div>}

      {/* Pool cards */}
      {!pools || pools.length === 0 ? (
        <div className={css.empty}>
          No pools found. Create one to get started.
        </div>
      ) : (
        <div className={css.grid2}>
          {pools.map((pool: PoolSummary) => {
            const isSelected = selectedPool === pool.name;

            return (
              <div
                key={pool.name}
                className={css.card}
                style={{
                  cursor: "pointer",
                  outline: isSelected ? "2px solid var(--color-accent)" : undefined,
                }}
                onClick={() => handleSelectPool(pool.name)}
              >
                {/* Card header: name + health */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <h3 className={css.cardTitle} style={{ margin: 0 }}>
                    {pool.name}
                  </h3>
                  <span className={healthBadge(pool.health)}>{pool.health}</span>
                </div>

                {/* Stats row */}
                <div className={css.grid4}>
                  <div>
                    <div className={css.statLabel}>Size</div>
                    <div className={css.mono}>{pool.size}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Used</div>
                    <div className={css.mono}>{pool.alloc}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Free</div>
                    <div className={css.mono}>{pool.free}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Frag</div>
                    <div className={css.mono}>{pool.fragmentation}</div>
                  </div>
                </div>

                {/* Capacity bar */}
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    height: 6,
                    background: "var(--color-bg-surface)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: pool.capacity,
                      background:
                        parseInt(pool.capacity, 10) > 85
                          ? "var(--color-danger)"
                          : parseInt(pool.capacity, 10) > 70
                            ? "var(--color-warning)"
                            : "var(--color-accent)",
                      borderRadius: "var(--radius-sm)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {/* Action buttons */}
                <div
                  className={css.actions}
                  style={{ marginTop: "var(--space-3)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={css.btnGhost}
                    onClick={() => handleScrub(pool.name)}
                    disabled={scrubMut.loading}
                  >
                    <RefreshCw size={12} />
                    {scrubMut.loading ? "Scrubbing..." : "Scrub"}
                  </button>
                  <button
                    className={css.btnGhost}
                    onClick={() => handleTrim(pool.name)}
                    disabled={trimMut.loading}
                  >
                    <Scissors size={12} />
                    {trimMut.loading ? "Trimming..." : "Trim"}
                  </button>
                  <button
                    className={css.btnGhost}
                    onClick={() =>
                      setConfirmTarget({ action: "export", pool: pool.name })
                    }
                    disabled={exportMut.loading}
                  >
                    <LogOut size={12} /> Export
                  </button>
                  <button
                    className={css.btnDanger}
                    onClick={() =>
                      setConfirmTarget({ action: "destroy", pool: pool.name })
                    }
                    disabled={destroyMut.loading}
                  >
                    <Trash2 size={12} /> Destroy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected pool detail panel */}
      {selectedPool && (
        <div style={{ marginTop: "var(--space-6)" }}>
          {detailLoading && (
            <div className={css.loading}>
              Loading details for {selectedPool}...
            </div>
          )}

          {detailError && <div className={css.error}>{detailError}</div>}

          {poolDetail && (
            <div className={css.grid2}>
              {/* Device tree */}
              <div className={css.card}>
                <h2 className={css.cardTitle}>
                  <HardDrive size={14} /> Device Tree
                </h2>

                {poolDetail.status.config.length === 0 ? (
                  <div className={css.empty}>No device information available.</div>
                ) : (
                  <DeviceTree devices={poolDetail.status.config} />
                )}

                {/* Status metadata */}
                {poolDetail.status.scan && (
                  <div
                    style={{ marginTop: "var(--space-3)" }}
                  >
                    <div className={css.statLabel}>Last Scan</div>
                    <div className={css.mono} style={{ fontSize: "var(--text-sm)" }}>
                      {poolDetail.status.scan}
                    </div>
                  </div>
                )}

                {poolDetail.status.errors &&
                  poolDetail.status.errors !== "No known data errors" && (
                    <div
                      className={css.badgeDanger}
                      style={{ marginTop: "var(--space-3)", display: "inline-flex" }}
                    >
                      <AlertTriangle size={12} /> {poolDetail.status.errors}
                    </div>
                  )}
              </div>

              {/* Properties panel */}
              <div className={css.card}>
                <h2 className={css.cardTitle}>Pool Properties</h2>
                <PropertyPanel properties={poolDetail.properties} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmTarget.action === "destroy"
              ? `Destroy Pool "${confirmTarget.pool}"`
              : `Export Pool "${confirmTarget.pool}"`
          }
          message={
            confirmTarget.action === "destroy"
              ? `This will permanently destroy the pool "${confirmTarget.pool}" and all of its data. This action cannot be undone.`
              : `This will export the pool "${confirmTarget.pool}", making it unavailable until re-imported.`
          }
          confirmValue={confirmTarget.pool}
          confirmLabel={confirmTarget.action === "destroy" ? "Destroy" : "Export"}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmTarget(null)}
          loading={
            confirmTarget.action === "destroy"
              ? destroyMut.loading
              : exportMut.loading
          }
        />
      )}

      {/* Pool creation wizard */}
      <PoolWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          refetch();
        }}
      />
    </div>
  );
}
