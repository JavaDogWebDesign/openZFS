import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  Disc,
  HardDrive,
  Camera,
  RefreshCw,
  Share2,
  Settings,
  Bell,
} from "lucide-react";
import clsx from "clsx";
import { listPools, getIostatHistory, logout } from "@/lib/api";
import { connectPool, seedHistory, type DataPoint } from "@/lib/iostat-store";
import { ActivityPanel } from "./ActivityPanel";
import styles from "./Layout.module.css";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pools", label: "Pools", icon: Database },
  { to: "/drives", label: "Drives", icon: Disc },
  { to: "/datasets", label: "Datasets", icon: HardDrive },
  { to: "/snapshots", label: "Snapshots", icon: Camera },
  { to: "/replication", label: "Replication", icon: RefreshCw },
  { to: "/sharing", label: "Sharing", icon: Share2 },
  { to: "/settings", label: "System", icon: Settings },
] as const;

interface LayoutProps {
  username: string;
  onLogout: () => void;
}

export function Layout({ username, onLogout }: LayoutProps) {
  const navigate = useNavigate();
  const [activityOpen, setActivityOpen] = useState(false);

  /* Start iostat data collection immediately on login so the Dashboard
     has historical data even if the user navigates elsewhere first.
     Also fetch server-side buffered history to pre-populate charts. */
  useEffect(() => {
    listPools()
      .then(async (pools) => {
        if (!pools?.length) return;
        const pool = pools[0].name;
        // Fetch server-side history buffer first
        try {
          const samples = await getIostatHistory(pool);
          if (samples?.length) {
            const now = new Date();
            const points: DataPoint[] = samples.map((s, i) => ({
              time: new Date(now.getTime() - (samples.length - i) * 1000)
                .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
              readIops: s.read_iops,
              writeIops: s.write_iops,
              readBw: s.read_bw,
              writeBw: s.write_bw,
            }));
            seedHistory(pool, points);
          }
        } catch {
          /* history endpoint may not exist on older backends */
        }
        connectPool(pool);
      })
      .catch(() => {/* Dashboard will retry */});
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore errors — clear local state anyway
    }
    onLogout();
    navigate("/login");
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Database className={styles.logoIcon} size={22} />
          ZFS Manager
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(styles.navLink, isActive && styles.navLinkActive)
              }
            >
              <Icon className={styles.navIcon} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.bellSection}>
          <button
            className={styles.bellBtn}
            onClick={() => setActivityOpen(true)}
            title="Activity"
          >
            <Bell size={18} />
          </button>
        </div>

        <div className={styles.userSection}>
          <span className={styles.username}>{username}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>

      <ActivityPanel
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />
    </div>
  );
}
