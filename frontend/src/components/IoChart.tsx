import { useCallback, useEffect, useRef, useState } from "react";
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
import { useWebSocket } from "@/hooks/useWebSocket";
import styles from "./IoChart.module.css";

/* ── Constants ──────────────────────────────────────────── */

const MAX_POINTS = 60;
const READ_COLOR = "#5b9cf5"; // accent blue
const WRITE_COLOR = "#c084fc"; // purple

/* ── Types ──────────────────────────────────────────────── */

interface IoStatMessage {
  read_iops: number;
  write_iops: number;
  read_bw: number; // bytes per second
  write_bw: number; // bytes per second
  timestamp?: number;
}

interface DataPoint {
  time: string;
  readIops: number;
  writeIops: number;
  readBw: number;
  writeBw: number;
}

interface IoChartProps {
  pool: string;
}

/* ── Helpers ────────────────────────────────────────────── */

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatAxisBw(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)}K`;
  return `${Math.round(bytes)}`;
}

/* ── Custom Tooltip ─────────────────────────────────────── */

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

/* ── Main Component ─────────────────────────────────────── */

export function IoChart({ pool }: IoChartProps) {
  const [history, setHistory] = useState<DataPoint[]>([]);
  const historyRef = useRef<DataPoint[]>([]);

  const { data, isConnected, error } = useWebSocket<IoStatMessage>({
    url: `/api/ws/iostat?pool=${encodeURIComponent(pool)}`,
  });

  /* Append incoming data to rolling window */
  const appendData = useCallback((msg: IoStatMessage) => {
    const now = new Date();
    const point: DataPoint = {
      time: formatTime(now),
      readIops: msg.read_iops,
      writeIops: msg.write_iops,
      readBw: msg.read_bw,
      writeBw: msg.write_bw,
    };

    const next = [...historyRef.current, point].slice(-MAX_POINTS);
    historyRef.current = next;
    setHistory(next);
  }, []);

  useEffect(() => {
    if (data) {
      appendData(data);
    }
  }, [data, appendData]);

  /* Reset history when pool changes */
  useEffect(() => {
    historyRef.current = [];
    setHistory([]);
  }, [pool]);

  /* Derive current values from the latest data point */
  const latest = history.length > 0 ? history[history.length - 1] : null;

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
      {/* ── Status bar ─────────────────────────────────── */}
      <div className={styles.statusBar}>
        <StatusIcon size={14} />
        <span className={`${styles.statusDot} ${statusDotClass}`} />
        <span className={styles.statusLabel}>{statusText}</span>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>

      {/* ── Stat cards ─────────────────────────────────── */}
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

      {/* ── Charts ─────────────────────────────────────── */}
      <div className={styles.chartsRow}>
        {/* IOPS chart */}
        <div className={styles.chartPanel}>
          <div className={styles.chartTitle}>
            <Activity size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            IOPS Over Time
          </div>
          <div className={styles.chartWrapper}>
            {history.length === 0 ? (
              <div className={styles.emptyState}>Waiting for data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
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
            {history.length === 0 ? (
              <div className={styles.emptyState}>Waiting for data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
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
