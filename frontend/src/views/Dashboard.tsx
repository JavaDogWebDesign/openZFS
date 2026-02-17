import { useMemo, useState } from "react";
import {
  Database,
  Heart,
  HardDrive,
  Bell,
  RefreshCw,
} from "lucide-react";
import { listPools, type PoolSummary } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useWebSocket } from "@/hooks/useWebSocket";
import { IoChart } from "@/components/IoChart";
import css from "@/styles/views.module.css";

/* ---------- WebSocket payload types ---------- */

interface ZfsEvent {
  class: string;
  timestamp: string;
  pool?: string;
  description?: string;
}

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

function parseCapacity(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

/* ---------- Component ---------- */

export function Dashboard(): JSX.Element {
  const { data: pools, loading, error, refetch } = useApi(() => listPools());

  /* Selected pool for IoChart (defaults to first pool) */
  const [selectedPool, setSelectedPool] = useState<string>("");
  const activePool = selectedPool || pools?.[0]?.name || "";

  /* WebSocket: ZFS event feed */
  const events = useWebSocket<ZfsEvent>({
    url: "/api/ws/events",
  });

  /* Accumulate events into a rolling buffer (last 20) */
  const eventLog = useMemo(() => {
    if (!events.data) return [] as ZfsEvent[];
    return [events.data];
  }, [events.data]);

  /* -- Derived stats -- */
  const totalPools = pools?.length ?? 0;

  const overallHealth = useMemo<string>(() => {
    if (!pools || pools.length === 0) return "N/A";
    const degraded = pools.some(
      (p) => p.health.toUpperCase() !== "ONLINE",
    );
    return degraded ? "DEGRADED" : "ONLINE";
  }, [pools]);

  const avgCapacity = useMemo<string>(() => {
    if (!pools || pools.length === 0) return "0%";
    const total = pools.reduce(
      (sum: number, p: PoolSummary) => sum + parseCapacity(p.capacity),
      0,
    );
    return `${Math.round(total / pools.length)}%`;
  }, [pools]);

  /* ---------- Render ---------- */

  if (loading) {
    return <div className={css.loading}>Loading dashboard...</div>;
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
        <h1 className={css.title}>Dashboard</h1>
        <div className={css.actions}>
          <button className={css.btnGhost} onClick={refetch}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className={css.grid3}>
        <div className={css.stat}>
          <div className={css.statLabel}>
            <Database size={12} /> Total Pools
          </div>
          <div className={css.statValue}>{totalPools}</div>
        </div>

        <div className={css.stat}>
          <div className={css.statLabel}>
            <Heart size={12} /> Overall Health
          </div>
          <div className={css.statValue}>
            <span className={healthBadge(overallHealth)}>{overallHealth}</span>
          </div>
        </div>

        <div className={css.stat}>
          <div className={css.statLabel}>
            <HardDrive size={12} /> Avg Capacity Used
          </div>
          <div className={css.statValue}>{avgCapacity}</div>
        </div>
      </div>

      {/* Compact Pool Health strip */}
      <div className={css.card} style={{ marginTop: "var(--space-4)" }}>
        <h2 className={css.cardTitle} style={{ marginBottom: "var(--space-2)" }}>Pool Health</h2>
        {!pools || pools.length === 0 ? (
          <div className={css.empty}>No pools found.</div>
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {pools.map((pool: PoolSummary) => (
              <div
                key={pool.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-bg-surface)",
                }}
              >
                <span className={css.mono} style={{ fontSize: "var(--text-sm)" }}>{pool.name}</span>
                <span className={healthBadge(pool.health)}>{pool.health}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-width I/O Activity Chart */}
      <div style={{ marginTop: "var(--space-4)" }}>
        {activePool ? (
          <IoChart
            pool={activePool}
            pools={pools?.map((p) => p.name)}
            onPoolChange={setSelectedPool}
          />
        ) : (
          <div className={css.card}>
            <h2 className={css.cardTitle}>I/O Activity</h2>
            <div className={css.empty}>No pools available for I/O stats.</div>
          </div>
        )}
      </div>

      {/* Recent Events */}
      <div className={css.card} style={{ marginTop: "var(--space-4)" }}>
        <h2 className={css.cardTitle}>
          <Bell size={14} /> Recent Events
          {events.isConnected && (
            <span
              className={css.badgeSuccess}
              style={{ marginLeft: "var(--space-2)" }}
            >
              Live
            </span>
          )}
        </h2>

        {events.error && <div className={css.error}>{events.error}</div>}

        {eventLog.length === 0 ? (
          <div className={css.empty}>
            No events yet. Live events will appear here as they occur.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {eventLog.map((evt: ZfsEvent, idx: number) => (
              <li
                key={`${evt.timestamp}-${idx}`}
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  alignItems: "baseline",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span
                  className={css.mono}
                  style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
                >
                  {evt.timestamp}
                </span>
                {evt.pool && (
                  <span className={css.badgeMuted}>{evt.pool}</span>
                )}
                <span>{evt.class}</span>
                {evt.description && (
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {evt.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
