import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  HardDrive,
  Camera,
  RefreshCw,
  Share2,
  Settings,
} from "lucide-react";
import clsx from "clsx";
import { logout } from "@/lib/api";
import styles from "./Layout.module.css";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pools", label: "Pools", icon: Database },
  { to: "/datasets", label: "Datasets", icon: HardDrive },
  { to: "/snapshots", label: "Snapshots", icon: Camera },
  { to: "/replication", label: "Replication", icon: RefreshCw },
  { to: "/sharing", label: "Sharing", icon: Share2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

interface LayoutProps {
  username: string;
  onLogout: () => void;
}

export function Layout({ username, onLogout }: LayoutProps) {
  const navigate = useNavigate();

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
    </div>
  );
}
