import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Activity, Wifi, WifiOff } from "lucide-react";
import {
  connectPool,
  getHistory,
  isConnected as storeIsConnected,
  getError as storeGetError,
  subscribe,
  type DataPoint,
} from "@/lib/iostat-store";
import styles from "./IoChart.module.css";

/* -- Constants -------------------------------------------------- */

const TIME_RANGES = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
] as const;

const READ_COLOR = "#5b9cf5"; // accent blue
const WRITE_COLOR = "#c084fc"; // purple

/* -- Props ------------------------------------------------------ */

interface IoChartProps {
  pool: string;
  pools?: string[];
  onPoolChange?: (pool: string) => void;
}

/* -- Helpers ---------------------------------------------------- */

function formatIops(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatBandwidth(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB/s`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB/s`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB/s`;
  return `${Math.round(bytes)} B/s`;
}

function formatAxisBw(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)}K`;
  return `${Math.round(bytes)}`;
}

/* -- Custom Tooltip --------------------------------------------- */

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  formatter: (value: number) => string;
}

function ChartTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className={styles.tooltipItem}>
          <span
            className={styles.tooltipDot}
            style={{ background: entry.color }}
          />
          {entry.name}: {formatter(entry.value)}
        </div>
      ))}
    </div>
  );
}

/* -- Main Component --------------------------------------------- */

export function IoChart({ pool, pools, onPoolChange }: IoChartProps) {
  const [timeRangeIdx, setTimeRangeIdx] = useState(0);
  const [, setTick] = useState(0); // force re-render on store changes

  const maxPoints = TIME_RANGES[timeRangeIdx].seconds;

  /* Connect to the store and subscribe for updates */
  useEffect(() => {
    connectPool(pool);
    return subscribe(() => setTick((n) => n + 1));
  }, [pool]);

  /* Read from the persistent store */
  const history = getHistory(pool);
  const isConnected = storeIsConnected();
  const error = storeGetError();

  /* Slice displayed data based on time range */
  const displayData: DataPoint[] = history.slice(-maxPoints);

  /* Derive current values from the latest data point */
  const latest = displayData.length > 0 ? displayData[displayData.length - 1] : null;

  /* Connection status display */
  const connectionStatus = error
    ? "reconnecting"
    : isConnected
      ? "connected"
      : "disconnected";

  const statusDotClass =
    connectionStatus === "connected"
      ? styles.statusDotConnected
      : connectionStatus === "reconnecting"
        ? styles.statusDotReconnecting
        : styles.statusDotDisconnected;

  const statusText =
    connectionStatus === "connected"
      ? "Live"
      : connectionStatus === "reconnecting"
        ? "Reconnecting..."
        : "Disconnected";

  const StatusIcon = isConnected ? Wifi : WifiOff;

  /* Shared Recharts styling props */
  const gridProps = {
    strokeDasharray: "3 3",
    stroke: "#333847",
    vertical: false,
  };

  const xAxisProps = {
    dataKey: "time" as const,
    tick: { fill: "#5f6478", fontSize: 11 },
    axisLine: { stroke: "#333847" },
    tickLine: false,
    interval: "preserveStartEnd" as const,
    minTickGap: 40,
  };

  return (
    <div className={styles.container}>
      {/* -- Control bar with status, time range, and pool selector -- */}
      <div className={styles.controlBar}>
        <div className={styles.statusBar}>
          <StatusIcon size={14} />
          <span className={`${styles.statusDot} ${statusDotClass}`} />
          <span className={styles.statusLabel}>{statusText}</span>
          {history.length > 0 && (
            <span style={{ color: "var(--color-text-dim)", fontSize: "var(--text-xs)" }}>
              ({history.length}s collected)
            </span>
          )}
          {error && <span className={styles.errorText}>{error}</span>}
        </div>

        <div className={styles.controlBarRight}>
          {/* Pool selector */}
          {pools && pools.length > 1 && onPoolChange && (
            <select
              className={styles.poolSelect}
              value={pool}
              onChange={(e) => onPoolChange(e.target.value)}
            >
              {pools.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {/* Time range selector */}
          <div className={styles.timeRangeGroup}>
            {TIME_RANGES.map((range, idx) => (
              <button
                key={range.label}
                className={`${styles.timeRangeBtn} ${idx === timeRangeIdx ? styles.timeRangeBtnActive : ""}`}
                onClick={() => setTimeRangeIdx(idx)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* -- Stat cards -------------------------------------------- */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <span
              className={styles.statLabelDot}
              style={{ background: READ_COLOR }}
            />
            Read IOPS
          </span>
          <span className={styles.statValue}>
            {latest ? formatIops(latest.readIops) : "--"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <span
              className={styles.statLabelDot}
              style={{ background: WRITE_COLOR }}
            />
            Write IOPS
          </span>
          <span className={styles.statValue}>
            {latest ? formatIops(latest.writeIops) : "--"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <span
              className={styles.statLabelDot}
              style={{ background: READ_COLOR }}
            />
            Read BW
          </span>
          <span className={styles.statValue}>
            {latest ? formatBandwidth(latest.readBw) : "--"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <span
              className={styles.statLabelDot}
              style={{ background: WRITE_COLOR }}
            />
            Write BW
          </span>
          <span className={styles.statValue}>
            {latest ? formatBandwidth(latest.writeBw) : "--"}
          </span>
        </div>
      </div>

      {/* -- Charts ------------------------------------------------ */}
      <div className={styles.chartsRow}>
        {/* IOPS chart */}
        <div className={styles.chartPanel}>
          <div className={styles.chartTitle}>
            <Activity size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            IOPS Over Time
          </div>
          <div className={styles.chartWrapper}>
            {displayData.length === 0 ? (
              <div className={styles.emptyState}>Waiting for data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayData}>
                  <defs>
                    <linearGradient id="gradReadIops" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={READ_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={READ_COLOR} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradWriteIops" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={WRITE_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={WRITE_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    tick={{ fill: "#5f6478", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatIops}
                    width={48}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip formatter={formatIops} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="readIops"
                    name="Read"
                    stroke={READ_COLOR}
                    strokeWidth={2}
                    fill="url(#gradReadIops)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="writeIops"
                    name="Write"
                    stroke={WRITE_COLOR}
                    strokeWidth={2}
                    fill="url(#gradWriteIops)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bandwidth chart */}
        <div className={styles.chartPanel}>
          <div className={styles.chartTitle}>
            <Activity size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Bandwidth Over Time
          </div>
          <div className={styles.chartWrapper}>
            {displayData.length === 0 ? (
              <div className={styles.emptyState}>Waiting for data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayData}>
                  <defs>
                    <linearGradient id="gradReadBw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={READ_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={READ_COLOR} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradWriteBw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={WRITE_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={WRITE_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    tick={{ fill: "#5f6478", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatAxisBw}
                    width={48}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip formatter={formatBandwidth} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="readBw"
                    name="Read"
                    stroke={READ_COLOR}
                    strokeWidth={2}
                    fill="url(#gradReadBw)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="writeBw"
                    name="Write"
                    stroke={WRITE_COLOR}
                    strokeWidth={2}
                    fill="url(#gradWriteBw)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
