import { useCallback, useEffect, useRef, useState } from "react";

interface UseWebSocketOptions {
  /** WebSocket URL path (e.g., "/api/ws/iostat?pool=tank") */
  url: string;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect on close (default: true) */
  reconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnects?: number;
}

interface UseWebSocketReturn<T> {
  data: T | null;
  isConnected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: unknown) => void;
}

export function useWebSocket<T = unknown>(
  options: UseWebSocketOptions,
): UseWebSocketReturn<T> {
  const { url, autoConnect = true, reconnect = true, reconnectDelay = 3000, maxReconnects = 10 } = options;

  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const disconnect = useCallback(() => {
    reconnectCountRef.current = maxReconnects; // Prevent reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [maxReconnects]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${url}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setData(parsed);
      } catch {
        setError("Failed to parse WebSocket message");
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (reconnect && reconnectCountRef.current < maxReconnects) {
        reconnectCountRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
      }
    };
  }, [url, reconnect, reconnectDelay, maxReconnects]);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      reconnectCountRef.current = maxReconnects;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [autoConnect, connect, maxReconnects]);

  return { data, isConnected, error, connect, disconnect, send };
}
