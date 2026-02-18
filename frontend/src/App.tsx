import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getMe } from "@/lib/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/Toast";
import { Login } from "@/views/Login";
import { Dashboard } from "@/views/Dashboard";
import { Pools } from "@/views/Pools";
import { Drives } from "@/views/Drives";
import { Datasets } from "@/views/Datasets";
import { Snapshots } from "@/views/Snapshots";
import { Replication } from "@/views/Replication";
import { Sharing } from "@/views/Sharing";
import { Settings } from "@/views/Settings";

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => setUsername(res.username))
      .catch(() => setUsername(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = useCallback((user: string) => {
    setUsername(user);
  }, []);

  const handleLogout = useCallback(() => {
    setUsername(null);
  }, []);

  if (checking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--color-bg)" }}>
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                username ? (
                  <Navigate to="/" replace />
                ) : (
                  <Login onLogin={handleLogin} />
                )
              }
            />

            {username ? (
              <Route element={<Layout username={username} onLogout={handleLogout} />}>
                <Route index element={<Dashboard />} />
                <Route path="pools" element={<Pools />} />
                <Route path="drives" element={<Drives />} />
                <Route path="datasets" element={<Datasets />} />
                <Route path="snapshots" element={<Snapshots />} />
                <Route path="replication" element={<Replication />} />
                <Route path="sharing" element={<Sharing />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            ) : (
              <Route path="*" element={<Navigate to="/login" replace />} />
            )}
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
