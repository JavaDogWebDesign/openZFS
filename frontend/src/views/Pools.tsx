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
  Clock,
} from "lucide-react";
import {
  listPools,
  getPool,
  scrubPool,
  trimPool,
  exportPool,
  destroyPool,
  listScrubSchedules,
  createScrubSchedule,
  deleteScrubSchedule,
  type PoolSummary,
  type PoolDetail,
  type ScrubSchedule,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PoolWizard } from "@/components/PoolWizard";
import { DeviceTree } from "@/components/DeviceTree";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
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

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatScheduleLabel(sched: ScrubSchedule): string {
  const time = `${String(sched.hour).padStart(2, "0")}:${String(sched.minute).padStart(2, "0")}`;
  if (sched.frequency === "daily") return `Daily ${time}`;
  if (sched.frequency === "weekly") return `Weekly ${DAYS_OF_WEEK[sched.day_of_week]} ${time}`;
  return `Monthly day ${sched.day_of_month} ${time}`;
}

export function Pools(): JSX.Element {
  const { data: pools, loading, error, refetch } = useApi(() => listPools());

  /* Scrub schedules */
  const {
    data: scrubSchedules,
    refetch: refetchSchedules,
  } = useApi<ScrubSchedule[]>(() => listScrubSchedules(), []);

  const [scheduleFormPool, setScheduleFormPool] = useState<string | null>(null);
  const [schedFreq, setSchedFreq] = useState("weekly");
  const [schedDow, setSchedDow] = useState(6); // Sun
  const [schedDom, setSchedDom] = useState(1);
  const [schedHour, setSchedHour] = useState(2);
  const [schedMin, setSchedMin] = useState(0);

  const { addToast } = useToast();

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
  const createSchedMut = useMutation(
    (body: Parameters<typeof createScrubSchedule>[0]) => createScrubSchedule(body),
  );
  const deleteSchedMut = useMutation((id: string) => deleteScrubSchedule(id));

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
      if (result) {
        addToast("success", `Scrub started on ${name}`);
        refetch();
      } else if (scrubMut.error) {
        addToast("error", scrubMut.error);
      }
    },
    [scrubMut, refetch, addToast],
  );

  const handleTrim = useCallback(
    async (name: string) => {
      const result = await trimMut.execute(name);
      if (result) {
        addToast("success", `Trim started on ${name}`);
        refetch();
      } else if (trimMut.error) {
        addToast("error", trimMut.error);
      }
    },
    [trimMut, refetch, addToast],
  );

  const handleCreateSchedule = useCallback(
    async (poolName: string) => {
      const result = await createSchedMut.execute({
        pool: poolName,
        frequency: schedFreq,
        day_of_week: schedDow,
        day_of_month: schedDom,
        hour: schedHour,
        minute: schedMin,
      });
      if (result) {
        addToast("success", `Scrub schedule created for ${poolName}`);
        setScheduleFormPool(null);
        refetchSchedules();
      }
    },
    [createSchedMut, schedFreq, schedDow, schedDom, schedHour, schedMin, addToast, refetchSchedules],
  );

  const handleDeleteSchedule = useCallback(
    async (id: string) => {
      const result = await deleteSchedMut.execute(id);
      if (result) {
        addToast("success", "Scrub schedule deleted");
        refetchSchedules();
      }
    },
    [deleteSchedMut, addToast, refetchSchedules],
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmTarget) return;

    if (confirmTarget.action === "export") {
      const result = await exportMut.execute(confirmTarget.pool);
      if (result) {
        addToast("success", `Pool ${confirmTarget.pool} exported`);
        setSelectedPool(null);
        refetch();
      } else if (exportMut.error) {
        addToast("error", exportMut.error);
      }
    } else if (confirmTarget.action === "destroy") {
      const result = await destroyMut.execute(confirmTarget.pool);
      if (result) {
        addToast("success", `Pool ${confirmTarget.pool} destroyed`);
        setSelectedPool(null);
        refetch();
      } else if (destroyMut.error) {
        addToast("error", destroyMut.error);
      }
    }
    setConfirmTarget(null);
  }, [confirmTarget, exportMut, destroyMut, refetch, addToast]);

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
                    <div className={css.mono}>{formatBytes(Number(pool.size))}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Used</div>
                    <div className={css.mono}>{formatBytes(Number(pool.alloc))}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Free</div>
                    <div className={css.mono}>{formatBytes(Number(pool.free))}</div>
                  </div>
                  <div>
                    <div className={css.statLabel}>Frag</div>
                    <div className={css.mono}>{pool.fragmentation}%</div>
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
                      width: `${parseInt(pool.capacity, 10)}%`,
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

                {/* Schedule info */}
                {scrubSchedules && (() => {
                  const sched = scrubSchedules.find((s) => s.pool === pool.name && s.enabled);
                  if (!sched) return null;
                  return (
                    <div
                      style={{
                        marginTop: "var(--space-2)",
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <Clock size={12} />
                      <span>Scrub: {formatScheduleLabel(sched)}</span>
                      {sched.last_status && (
                        <span className={sched.last_status === "started" ? css.badgeSuccess : css.badgeWarning}>
                          {sched.last_status}
                        </span>
                      )}
                    </div>
                  );
                })()}

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
                    onClick={() => {
                      setScheduleFormPool(
                        scheduleFormPool === pool.name ? null : pool.name,
                      );
                    }}
                  >
                    <Clock size={12} /> Schedule
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

                {/* Inline schedule form */}
                {scheduleFormPool === pool.name && (
                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      paddingTop: "var(--space-3)",
                      borderTop: "1px solid var(--color-border)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                      Scrub Schedule
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>
                          Frequency
                        </label>
                        <select
                          className={css.select}
                          value={schedFreq}
                          onChange={(e) => setSchedFreq(e.target.value)}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      {schedFreq === "weekly" && (
                        <div>
                          <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>
                            Day
                          </label>
                          <select
                            className={css.select}
                            value={schedDow}
                            onChange={(e) => setSchedDow(Number(e.target.value))}
                          >
                            {DAYS_OF_WEEK.map((d, i) => (
                              <option key={d} value={i}>{d}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {schedFreq === "monthly" && (
                        <div>
                          <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>
                            Day
                          </label>
                          <select
                            className={css.select}
                            value={schedDom}
                            onChange={(e) => setSchedDom(Number(e.target.value))}
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>
                          Hour
                        </label>
                        <select
                          className={css.select}
                          value={schedHour}
                          onChange={(e) => setSchedHour(Number(e.target.value))}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 2 }}>
                          Min
                        </label>
                        <select
                          className={css.select}
                          value={schedMin}
                          onChange={(e) => setSchedMin(Number(e.target.value))}
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className={css.btnPrimary}
                        onClick={() => handleCreateSchedule(pool.name)}
                        disabled={createSchedMut.loading}
                      >
                        {createSchedMut.loading ? "..." : "Save"}
                      </button>
                    </div>

                    {/* Existing schedules for this pool */}
                    {scrubSchedules && scrubSchedules
                      .filter((sc) => sc.pool === pool.name)
                      .map((sc) => (
                        <div
                          key={sc.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            marginTop: "var(--space-2)",
                            fontSize: "var(--text-xs)",
                          }}
                        >
                          <span className={sc.enabled ? css.badgeSuccess : css.badgeMuted}>
                            {sc.enabled ? "On" : "Off"}
                          </span>
                          <span>{formatScheduleLabel(sc)}</span>
                          <button
                            className={css.btnDanger}
                            style={{ padding: "2px 6px", fontSize: "var(--text-xs)" }}
                            onClick={() => handleDeleteSchedule(sc.id)}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
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
