import { useEffect } from "react";
import { X, CheckCircle, XCircle } from "lucide-react";
import { getAuditLog } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { formatTimestamp } from "@/lib/format";
import styles from "./ActivityPanel.module.css";
import s from "@/styles/views.module.css";

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ActivityPanel({ open, onClose }: ActivityPanelProps) {
  const {
    data: entries,
    loading,
    error,
    refetch,
  } = useApi(() => getAuditLog(20, 0), []);

  // Refresh when panel opens
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Drawer */}
      <aside className={styles.drawer}>
        <div className={styles.header}>
          <h2 className={styles.title}>Activity</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {loading && <div className={s.loading}>Loading...</div>}
          {error && <div className={s.error}>{error}</div>}

          {entries && entries.length === 0 && (
            <div className={s.empty}>No activity yet.</div>
          )}

          {entries && entries.map((entry) => (
            <div key={entry.id} className={styles.entry}>
              <div className={styles.entryHeader}>
                {entry.success === 1 ? (
                  <CheckCircle size={14} className={styles.iconSuccess} />
                ) : (
                  <XCircle size={14} className={styles.iconError} />
                )}
                <span className={styles.action}>{entry.action}</span>
                <span className={styles.timestamp}>
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              <div className={styles.target}>{entry.target}</div>
              {entry.username && (
                <div className={styles.user}>{entry.username}</div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
