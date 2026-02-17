import { getSystemVersion, getArcStats, getAuditLog } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import {
  Server,
  Database,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  FileText,
} from "lucide-react";
import s from "@/styles/views.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function Settings() {
  const {
    data: version,
    loading: versionLoading,
    error: versionError,
    refetch: refetchVersion,
  } = useApi(() => getSystemVersion(), []);

  const {
    data: arc,
    loading: arcLoading,
    error: arcError,
    refetch: refetchArc,
  } = useApi(() => getArcStats(), []);

  const {
    data: auditLog,
    loading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useApi(() => getAuditLog(100, 0), []);

  const handleRefreshAll = () => {
    refetchVersion();
    refetchArc();
    refetchAudit();
  };

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={handleRefreshAll}>
            <RefreshCw size={14} /> Refresh All
          </button>
        </div>
      </div>

      {/* Server Info */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Server
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          Server Information
        </h2>

        {versionLoading ? (
          <div className={s.loading}>Loading version info...</div>
        ) : versionError ? (
          <div className={s.error}>{versionError}</div>
        ) : version ? (
          <div className={s.grid2}>
            <div className={s.stat}>
              <div className={s.statLabel}>ZFS Version</div>
              <div className={s.statValue}>{version.zfs_version}</div>
            </div>
            <div className={s.stat}>
              <div className={s.statLabel}>Zpool Version</div>
              <div className={s.statValue}>{version.zpool_version}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ARC Statistics */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Database
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          ARC Statistics
          <button
            className={s.btnGhost}
            onClick={refetchArc}
            style={{ marginLeft: "auto", float: "right" }}
          >
            <RefreshCw size={12} />
          </button>
        </h2>

        {arcLoading ? (
          <div className={s.loading}>Loading ARC statistics...</div>
        ) : arcError ? (
          <div className={s.error}>{arcError}</div>
        ) : arc ? (
          <>
            {/* Primary stats */}
            <div
              className={s.grid4}
              style={{ marginBottom: "var(--space-4)" }}
            >
              <div className={s.stat}>
                <div className={s.statLabel}>ARC Size</div>
                <div className={s.statValue}>{formatBytes(arc.size)}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Max Size</div>
                <div className={s.statValue}>{formatBytes(arc.max_size)}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Hit Rate</div>
                <div className={s.statValue}>
                  <span
                    style={{
                      color:
                        arc.hit_rate > 0.9
                          ? "var(--color-success)"
                          : arc.hit_rate > 0.7
                            ? "var(--color-warning)"
                            : "var(--color-danger)",
                    }}
                  >
                    {formatPercent(arc.hit_rate)}
                  </span>
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Miss Rate</div>
                <div className={s.statValue}>
                  {formatPercent(arc.miss_rate)}
                </div>
              </div>
            </div>

            {/* ARC Utilization Bar */}
            <div style={{ marginBottom: "var(--space-4)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-muted)",
                  marginBottom: "var(--space-1)",
                }}
              >
                <span>ARC Utilization</span>
                <span>
                  {formatBytes(arc.size)} / {formatBytes(arc.max_size)} (
                  {formatPercent(arc.max_size > 0 ? arc.size / arc.max_size : 0)}
                  )
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "var(--color-bg-surface)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${arc.max_size > 0 ? (arc.size / arc.max_size) * 100 : 0}%`,
                    background: "var(--color-accent)",
                    borderRadius: "var(--radius-sm)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* MRU / MFU Breakdown */}
            <div className={s.grid3}>
              <div className={s.stat}>
                <div className={s.statLabel}>MRU Size (Recently Used)</div>
                <div className={s.statValue}>{formatBytes(arc.mru_size)}</div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {arc.size > 0
                    ? formatPercent(arc.mru_size / arc.size)
                    : "0%"}{" "}
                  of ARC
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>MFU Size (Frequently Used)</div>
                <div className={s.statValue}>{formatBytes(arc.mfu_size)}</div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {arc.size > 0
                    ? formatPercent(arc.mfu_size / arc.size)
                    : "0%"}{" "}
                  of ARC
                </div>
              </div>
              {arc.l2_size != null && arc.l2_size > 0 && (
                <div className={s.stat}>
                  <div className={s.statLabel}>L2ARC Size</div>
                  <div className={s.statValue}>
                    {formatBytes(arc.l2_size)}
                  </div>
                  {arc.l2_hit_rate != null && (
                    <div
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                        marginTop: "var(--space-1)",
                      }}
                    >
                      Hit rate: {formatPercent(arc.l2_hit_rate)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Audit Log */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <FileText
            size={16}
            style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
          />
          Audit Log
          <button
            className={s.btnGhost}
            onClick={refetchAudit}
            style={{ marginLeft: "auto", float: "right" }}
          >
            <RefreshCw size={12} />
          </button>
        </h2>

        {auditLoading ? (
          <div className={s.loading}>Loading audit log...</div>
        ) : auditError ? (
          <div className={s.error}>{auditError}</div>
        ) : !auditLog?.length ? (
          <div className={s.empty}>
            <Activity
              size={24}
              style={{ marginBottom: "var(--space-2)", opacity: 0.5 }}
            />
            <div>No audit log entries found.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    Timestamp
                  </th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    User
                  </th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Action
                  </th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Target
                  </th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td
                      className={s.mono}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      {entry.username}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <span className={s.badgeMuted}>{entry.action}</span>
                    </td>
                    <td
                      className={s.mono}
                      style={{ padding: "var(--space-2) var(--space-3)" }}
                    >
                      {entry.target}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      {entry.success === 1 ? (
                        <span className={s.badgeSuccess}>
                          <CheckCircle
                            size={10}
                            style={{ marginRight: "4px" }}
                          />
                          OK
                        </span>
                      ) : (
                        <span className={s.badgeDanger}>
                          <XCircle
                            size={10}
                            style={{ marginRight: "4px" }}
                          />
                          Failed
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
    </div>
  );
}
