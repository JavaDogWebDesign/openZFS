import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getMe } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Login } from "@/views/Login";
import { Dashboard } from "@/views/Dashboard";
import { Pools } from "@/views/Pools";
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
    return null; // Could show a spinner here
  }

  return (
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
  );
}
