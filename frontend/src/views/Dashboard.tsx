import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database,
  Heart,
  HardDrive,
  Bell,
  RefreshCw,
  Plus,
  Share2,
  UserPlus,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { listPools, listSmbShares, listNfsExports, listSystemUsers, type PoolSummary } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useWebSocket } from "@/hooks/useWebSocket";
import { IoChart } from "@/components/IoChart";
import { connectPool } from "@/lib/iostat-store";
import { healthBadgeClass } from "@/lib/format";
import css from "@/styles/views.module.css";

/* ---------- WebSocket payload types ---------- */

interface ZfsEvent {
  class: string;
  timestamp: string;
  pool?: string;
  description?: string;
}

/* ---------- Helpers ---------- */

function parseCapacity(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

/* ---------- Component ---------- */

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const { data: pools, loading, error, refetch } = useApi(() => listPools());
  const { data: smbShares } = useApi(() => listSmbShares());
  const { data: nfsExports } = useApi(() => listNfsExports());
  const { data: systemUsers } = useApi(() => listSystemUsers());

  /* Selected pool for IoChart (defaults to first pool) */
  const [selectedPool, setSelectedPool] = useState<string>("");
  const activePool = selectedPool || pools?.[0]?.name || "";

  /* Start iostat collection as soon as we know a pool name */
  useEffect(() => {
    if (activePool) connectPool(activePool);
  }, [activePool]);

  /* WebSocket: ZFS event feed */
  const events = useWebSocket<ZfsEvent>({
    url: "/api/ws/events",
  });

  /* Accumulate events into a rolling buffer (last 50) */
  const eventLogRef = useRef<ZfsEvent[]>([]);
  const [eventLog, setEventLog] = useState<ZfsEvent[]>([]);
  useEffect(() => {
    if (!events.data) return;
    const next = [events.data, ...eventLogRef.current].slice(0, 50);
    eventLogRef.current = next;
    setEventLog(next);
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

  /* -- Setup steps -- */
  const hasPool = (pools?.length ?? 0) > 0;
  const hasShare = (smbShares?.length ?? 0) > 0 || (nfsExports?.length ?? 0) > 0;
  const hasUsers = (systemUsers?.length ?? 0) > 0;
  const setupSteps = [
    { key: "pool", done: hasPool, title: "Create a Storage Pool", desc: "Combine your drives into a redundant storage pool", icon: Database, link: "/pools" },
    { key: "share", done: hasShare, title: "Share a Folder", desc: "Create an SMB or NFS share for network access", icon: Share2, link: "/datasets" },
    { key: "user", done: hasUsers, title: "Add Users", desc: "Create user accounts for file sharing access", icon: UserPlus, link: "/users" },
  ];
  const setupIncomplete = setupSteps.some((s) => !s.done);

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

      {/* Setup Guide */}
      {setupIncomplete && (
        <div className={css.card} style={{ marginBottom: "var(--space-4)" }}>
          <h2 className={css.cardTitle}>Get Started</h2>
          <div className={css.grid3}>
            {setupSteps.map((step) => (
              <div
                key={step.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                  padding: "var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  background: step.done ? "var(--color-success-dim)" : "var(--color-bg-surface)",
                  opacity: step.done ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  {step.done ? (
                    <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />
                  ) : (
                    <step.icon size={16} style={{ color: "var(--color-accent)" }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{step.title}</span>
                </div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{step.desc}</span>
                {!step.done && (
                  <button
                    className={css.btnPrimary}
                    style={{ alignSelf: "flex-start", marginTop: "var(--space-1)", fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)" }}
                    onClick={() => navigate(step.link)}
                  >
                    Go <ChevronRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className={css.grid3} style={{ marginBottom: "var(--space-4)" }}>
        {[
          { label: "New Pool", icon: Plus, link: "/pools" },
          { label: "New Share", icon: Share2, link: "/datasets" },
          { label: "Add User", icon: UserPlus, link: "/users" },
        ].map((action) => (
          <button
            key={action.label}
            className={css.card}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "1px solid var(--color-border)",
              transition: "border-color 0.15s",
            }}
            onClick={() => navigate(action.link)}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          >
            <action.icon size={18} style={{ color: "var(--color-accent)" }} />
            {action.label}
          </button>
        ))}
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
            <span className={healthBadgeClass(overallHealth, css)}>{overallHealth}</span>
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
                <span className={healthBadgeClass(pool.health, css)}>{pool.health}</span>
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
