import { useMemo } from "react";
import { RefreshCw, HardDrive, Disc, Thermometer, Clock } from "lucide-react";
import { listDrivesDetailed, type DriveInfo } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import css from "@/styles/views.module.css";

/* ---------- Helpers ---------- */

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatHours(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  const years = (days / 365).toFixed(1);
  return `${years}y`;
}

function smartBadge(drive: DriveInfo): { label: string; className: string } {
  if (!drive.smart.available) {
    return { label: "N/A", className: css.badgeMuted };
  }
  if (drive.smart.healthy === true) {
    return { label: "PASSED", className: css.badgeSuccess };
  }
  if (drive.smart.healthy === false) {
    return { label: "FAILED", className: css.badgeDanger };
  }
  return { label: "UNKNOWN", className: css.badgeWarning };
}

/* ---------- Component ---------- */

export function Drives(): JSX.Element {
  const { data, loading, error, refetch } = useApi(() => listDrivesDetailed());

  const drives = data?.drives ?? [];

  const stats = useMemo(() => {
    const total = drives.length;
    const healthy = drives.filter(
      (d) => d.smart.available && d.smart.healthy === true,
    ).length;
    const ssds = drives.filter((d) => d.type === "SSD" || d.type === "NVMe").length;
    const hdds = drives.filter((d) => d.type === "HDD").length;
    return { total, healthy, ssds, hdds };
  }, [drives]);

  /* ---------- Render ---------- */

  if (loading) {
    return <div className={css.loading}>Loading drives...</div>;
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
        <h1 className={css.title}>Drives</h1>
        <div className={css.actions}>
          <button className={css.btnGhost} onClick={refetch}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className={css.grid4}>
        <div className={css.stat}>
          <div className={css.statLabel}>
            <HardDrive size={12} /> Total Drives
          </div>
          <div className={css.statValue}>{stats.total}</div>
        </div>
        <div className={css.stat}>
          <div className={css.statLabel}>Healthy</div>
          <div className={css.statValue}>
            <span className={stats.healthy === stats.total ? css.badgeSuccess : css.badgeWarning}>
              {stats.healthy} / {stats.total}
            </span>
          </div>
        </div>
        <div className={css.stat}>
          <div className={css.statLabel}>SSDs / NVMe</div>
          <div className={css.statValue}>{stats.ssds}</div>
        </div>
        <div className={css.stat}>
          <div className={css.statLabel}>HDDs</div>
          <div className={css.statValue}>{stats.hdds}</div>
        </div>
      </div>

      {/* Drive cards */}
      {drives.length === 0 ? (
        <div className={css.empty}>No physical drives detected.</div>
      ) : (
        <div className={css.grid3} style={{ marginTop: "var(--space-6)" }}>
          {drives.map((drive) => {
            const badge = smartBadge(drive);
            return (
              <div key={drive.name} className={css.card}>
                {/* Card header: device name + SMART badge */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <h3 className={css.cardTitle} style={{ margin: 0 }}>
                    <Disc size={14} style={{ marginRight: "var(--space-2)" }} />
                    {drive.name.replace("/dev/", "")}
                  </h3>
                  <span className={badge.className}>{badge.label}</span>
                </div>

                {/* Model + size + type */}
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <div style={{ fontWeight: 500 }}>
                    {drive.model ?? "Unknown Model"}
                  </div>
                  <div
                    className={css.mono}
                    style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}
                  >
                    {formatBytes(drive.size)} &middot; {drive.type}
                    {drive.transport ? ` (${drive.transport})` : ""}
                  </div>
                </div>

                {/* Serial */}
                {drive.serial && (
                  <div style={{ marginBottom: "var(--space-2)" }}>
                    <div className={css.statLabel}>Serial</div>
                    <div className={css.mono}>{drive.serial}</div>
                  </div>
                )}

                {/* Pool membership */}
                <div style={{ marginBottom: "var(--space-2)" }}>
                  <div className={css.statLabel}>Pool</div>
                  <div>
                    {drive.pool ? (
                      <span className={css.badgeSuccess}>{drive.pool}</span>
                    ) : (
                      <span className={css.badgeMuted}>Unused</span>
                    )}
                  </div>
                </div>

                {/* Temperature + power-on hours */}
                {drive.smart.available && (
                  <div className={css.grid2} style={{ marginTop: "var(--space-2)" }}>
                    <div>
                      <div className={css.statLabel}>
                        <Thermometer size={10} /> Temp
                      </div>
                      <div className={css.mono}>
                        {drive.smart.temperature != null
                          ? `${drive.smart.temperature}\u00B0C`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className={css.statLabel}>
                        <Clock size={10} /> Power-On
                      </div>
                      <div className={css.mono}>
                        {formatHours(drive.smart.power_on_hours)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Partition children */}
                {drive.children.length > 0 && (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <div className={css.statLabel}>Partitions</div>
                    <div
                      className={css.mono}
                      style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}
                    >
                      {drive.children.map((c) => {
                        const partName = c.name.replace("/dev/", "");
                        return (
                          <div key={c.name}>
                            {partName}
                            {c.fstype ? ` [${c.fstype}]` : ""}
                            {c.mountpoint ? ` → ${c.mountpoint}` : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
