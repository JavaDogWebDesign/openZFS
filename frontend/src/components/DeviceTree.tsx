import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  HardDrive,
  Database,
  AlertTriangle,
} from "lucide-react";
import type { DeviceNode } from "@/lib/api";
import styles from "./DeviceTree.module.css";

/* ── Types ──────────────────────────────────────────────── */

interface DeviceTreeProps {
  devices: DeviceNode[];
}

/**
 * Tracks which tree paths (by device name trail) are collapsed.
 * All nodes start expanded by default.
 */
type CollapsedSet = Set<string>;

/* ── Helpers ────────────────────────────────────────────── */

function stateClass(state: string): string {
  const s = state.toUpperCase();
  if (s === "ONLINE") return styles.stateOnline;
  if (s === "DEGRADED") return styles.stateDegraded;
  if (s === "FAULTED" || s === "UNAVAIL") return styles.stateFaulted;
  return styles.stateOffline; // OFFLINE, REMOVED, etc.
}

function hasErrors(node: DeviceNode): boolean {
  return (
    node.read_errors !== "0" ||
    node.write_errors !== "0" ||
    node.checksum_errors !== "0"
  );
}

/** Build a stable key for a node based on its path in the tree. */
function nodeKey(ancestorPath: string, name: string): string {
  return ancestorPath ? `${ancestorPath}/${name}` : name;
}

/**
 * Whether a node represents a vdev group (mirror, raidz, etc.) rather than
 * a leaf device. Group nodes get a folder-style icon, leaf nodes a disk icon.
 */
function isGroupNode(node: DeviceNode): boolean {
  return node.children.length > 0;
}

/* ── Tree Node ──────────────────────────────────────────── */

interface TreeNodeProps {
  node: DeviceNode;
  path: string;
  depth: number;
  isLast: boolean;
  /** Encodes per-depth whether the ancestor at that level was the last child. */
  ancestorIsLast: boolean[];
  collapsed: CollapsedSet;
  onToggle: (key: string) => void;
}

function TreeNode({
  node,
  path,
  depth,
  isLast,
  ancestorIsLast,
  collapsed,
  onToggle,
}: TreeNodeProps) {
  const key = nodeKey(path, node.name);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(key);

  const Icon = isGroupNode(node) ? Database : HardDrive;

  /* Build indent guide segments */
  const guides: React.ReactNode[] = [];
  for (let i = 0; i < depth; i++) {
    const isLastAtLevel = i < depth - 1 ? ancestorIsLast[i] : isLast;
    const isContinuation = i < depth - 1;

    let segmentClass = styles.indentSegment;
    if (isLastAtLevel && isContinuation) {
      segmentClass += ` ${styles.indentSegmentEmpty}`;
    } else if (isLastAtLevel) {
      segmentClass += ` ${styles.indentSegmentLast}`;
    } else if (isContinuation) {
      segmentClass += ` ${styles.indentSegmentContinue}`;
    }

    guides.push(<span key={i} className={segmentClass} />);
  }

  /* Updated ancestor tracking for children */
  const childAncestorIsLast = [...ancestorIsLast.slice(0, depth), isLast];

  return (
    <div className={styles.node}>
      <div className={styles.nodeRow}>
        {/* Indentation with tree lines */}
        {depth > 0 && (
          <span className={styles.indentGuide}>{guides}</span>
        )}

        {/* Expand / collapse toggle */}
        {hasChildren ? (
          <button
            className={styles.toggle}
            onClick={() => onToggle(key)}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        ) : (
          <span className={styles.togglePlaceholder} />
        )}

        {/* Device icon */}
        <Icon size={14} className={styles.deviceIcon} />

        {/* Device name */}
        <span className={styles.deviceName}>{node.name}</span>

        {/* State badge */}
        <span className={`${styles.stateBadge} ${stateClass(node.state)}`}>
          {node.state}
        </span>

        {/* Error badges (only when non-zero) */}
        {hasErrors(node) && (
          <span className={styles.errorsGroup}>
            {node.read_errors !== "0" && (
              <span className={styles.errorBadge}>
                <AlertTriangle
                  size={10}
                  className={styles.errorBadgeIcon}
                />
                R:{node.read_errors}
              </span>
            )}
            {node.write_errors !== "0" && (
              <span className={styles.errorBadge}>
                <AlertTriangle
                  size={10}
                  className={styles.errorBadgeIcon}
                />
                W:{node.write_errors}
              </span>
            )}
            {node.checksum_errors !== "0" && (
              <span className={styles.errorBadge}>
                <AlertTriangle
                  size={10}
                  className={styles.errorBadgeIcon}
                />
                C:{node.checksum_errors}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && (
        <div
          className={
            isCollapsed ? styles.childrenCollapsed : styles.children
          }
        >
          {node.children.map((child, idx) => (
            <TreeNode
              key={nodeKey(key, child.name)}
              node={child}
              path={key}
              depth={depth + 1}
              isLast={idx === node.children.length - 1}
              ancestorIsLast={childAncestorIsLast}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export function DeviceTree({ devices }: DeviceTreeProps) {
  const [collapsed, setCollapsed] = useState<CollapsedSet>(new Set());

  const handleToggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  if (devices.length === 0) {
    return <div className={styles.empty}>No devices to display.</div>;
  }

  return (
    <div className={styles.container}>
      {devices.map((device, idx) => (
        <TreeNode
          key={nodeKey("", device.name)}
          node={device}
          path=""
          depth={0}
          isLast={idx === devices.length - 1}
          ancestorIsLast={[]}
          collapsed={collapsed}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
