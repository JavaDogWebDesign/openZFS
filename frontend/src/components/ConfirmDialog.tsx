import { useState } from "react";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  /** Title shown at the top of the dialog */
  title: string;
  /** Description of what will happen */
  message: string;
  /** The value the user must type to confirm (e.g., pool name) */
  confirmValue: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Called when confirmed */
  onConfirm: () => void;
  /** Called when cancelled */
  onCancel: () => void;
  /** Whether the action is in progress */
  loading?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmValue,
  confirmLabel = "Destroy",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const [input, setInput] = useState("");
  const isMatch = input === confirmValue;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>

        <label className={styles.inputLabel}>
          Type <span className={styles.target}>{confirmValue}</span> to confirm:
        </label>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={confirmValue}
          autoFocus
          disabled={loading}
        />

        <div className={styles.actions}>
          <button
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={onConfirm}
            disabled={!isMatch || loading}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
