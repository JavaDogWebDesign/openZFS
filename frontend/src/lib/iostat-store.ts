/**
 * Module-level singleton that keeps the iostat WebSocket alive across
 * page navigation. Data accumulates continuously once a pool is connected,
 * even when the Dashboard/IoChart is not mounted.
 */

/* -- Types ------------------------------------------------------ */

interface IoStatMessage {
  read_iops: number;
  write_iops: number;
  read_bw: number;
  write_bw: number;
  timestamp?: number;
}

export interface DataPoint {
  time: string;
  readIops: number;
  writeIops: number;
  readBw: number;
  writeBw: number;
}

type Listener = () => void;

/* -- Constants -------------------------------------------------- */

const MAX_POINTS = 3600; // 1 hour at 1 sample/s
const RECONNECT_DELAY = 3000;
const MAX_RECONNECTS = 100;

/* -- Module state ----------------------------------------------- */

let ws: WebSocket | null = null;
let currentPool = "";
let reconnectCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let connected = false;
let wsError: string | null = null;

/** History keyed by pool name — survives component unmounts */
const historyMap = new Map<string, DataPoint[]>();

/** Subscribers notified on every data change / connection change */
const listeners = new Set<Listener>();

/* -- Helpers ---------------------------------------------------- */

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function notify() {
  listeners.forEach((l) => l());
}

/* -- WebSocket management --------------------------------------- */

function doConnect() {
  if (!currentPool) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/ws/iostat?pool=${encodeURIComponent(currentPool)}`;

  const socket = new WebSocket(wsUrl);
  ws = socket;

  socket.onopen = () => {
    connected = true;
    wsError = null;
    reconnectCount = 0;
    notify();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as IoStatMessage;
      const point: DataPoint = {
        time: formatTime(new Date()),
        readIops: msg.read_iops,
        writeIops: msg.write_iops,
        readBw: msg.read_bw,
        writeBw: msg.write_bw,
      };
      const history = historyMap.get(currentPool) || [];
      const next = [...history, point].slice(-MAX_POINTS);
      historyMap.set(currentPool, next);
      notify();
    } catch {
      // ignore parse errors
    }
  };

  socket.onerror = () => {
    wsError = "WebSocket connection error";
    notify();
  };

  socket.onclose = () => {
    connected = false;
    ws = null;
    notify();
    if (reconnectCount < MAX_RECONNECTS) {
      reconnectCount++;
      reconnectTimer = setTimeout(doConnect, RECONNECT_DELAY);
    }
  };
}

/* -- Public API ------------------------------------------------- */

/**
 * Connect (or switch) to a pool's iostat stream.
 * If already connected to this pool, this is a no-op.
 */
export function connectPool(pool: string): void {
  if (pool === currentPool && ws?.readyState === WebSocket.OPEN) return;

  if (pool !== currentPool) {
    currentPool = pool;
    reconnectCount = 0;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      const oldWs = ws;
      ws = null;
      oldWs.close();
    }
  }

  doConnect();
}

/**
 * Disconnect the current WebSocket and stop reconnecting.
 * Use before pool destroy to release the iostat subprocess.
 */
export function disconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectCount = MAX_RECONNECTS; // prevent reconnect
  if (ws) {
    const oldWs = ws;
    ws = null;
    oldWs.close();
  }
  currentPool = "";
  connected = false;
  wsError = null;
  notify();
}

/** Get accumulated history for a pool (empty array if none). */
export function getHistory(pool: string): DataPoint[] {
  return historyMap.get(pool) || [];
}

/**
 * Seed the history for a pool from server-side buffered data.
 * Called once on connect to pre-populate charts with historical data.
 */
export function seedHistory(pool: string, points: DataPoint[]): void {
  if (points.length === 0) return;
  const existing = historyMap.get(pool) || [];
  if (existing.length === 0) {
    historyMap.set(pool, points.slice(-MAX_POINTS));
    notify();
  }
}

/** Current pool being monitored. */
export function getCurrentPool(): string {
  return currentPool;
}

/** Whether the WebSocket is currently open. */
export function isConnected(): boolean {
  return connected;
}

/** Current error message, if any. */
export function getError(): string | null {
  return wsError;
}

/**
 * Subscribe to store changes. Returns an unsubscribe function.
 * Called on every new data point and connection state change.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
