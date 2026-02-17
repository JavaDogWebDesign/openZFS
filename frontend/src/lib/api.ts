/**
 * Typed API client for the ZFS Manager backend.
 *
 * All requests go through the Vite proxy (/api → localhost:8080).
 * Includes CSRF header for state-changing requests.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string },
  ) {
    super(body.error);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // CSRF protection for mutating requests
  if (method !== "GET") {
    headers["X-Requested-With"] = "XMLHttpRequest";
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, errorBody);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// Convenience methods
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

// --- Encoded path helpers ---

/** Encode a ZFS dataset path for use in URL segments */
export function encodePath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

// --- Auth ---

export function login(username: string, password: string) {
  return api.post<{ username: string; message: string }>("/api/auth/login", {
    username,
    password,
  });
}

export function logout() {
  return api.post<{ message: string }>("/api/auth/logout");
}

export function getMe() {
  return api.get<{ username: string }>("/api/auth/me");
}

// --- Pools ---

export interface PoolSummary {
  name: string;
  size: string;
  alloc: string;
  free: string;
  fragmentation: string;
  capacity: string;
  health: string;
}

export interface DeviceNode {
  name: string;
  state: string;
  read_errors: string;
  write_errors: string;
  checksum_errors: string;
  children: DeviceNode[];
}

export interface PoolStatus {
  pool: string;
  state: string;
  status: string;
  action: string;
  scan: string;
  config: DeviceNode[];
  errors: string;
  raw: string;
}

export interface PoolDetail {
  status: PoolStatus;
  properties: Record<string, { value: string; source: string }>;
}

export function listPools() {
  return api.get<PoolSummary[]>("/api/pools");
}

export function getPool(pool: string) {
  return api.get<PoolDetail>(`/api/pools/${encodeURIComponent(pool)}`);
}

export function createPool(body: {
  name: string;
  vdevs: string[];
  force?: boolean;
  mountpoint?: string;
  properties?: Record<string, string>;
  fs_properties?: Record<string, string>;
}) {
  return api.post<{ message: string }>("/api/pools", body);
}

export function destroyPool(pool: string, confirm: string, force = false) {
  return api.del<{ message: string }>(`/api/pools/${encodeURIComponent(pool)}`, {
    confirm,
    force,
  });
}

export function scrubPool(pool: string, action: "start" | "pause" | "stop" = "start") {
  return api.post<{ message: string }>(
    `/api/pools/${encodeURIComponent(pool)}/scrub`,
    { action },
  );
}

export function trimPool(pool: string, stop = false) {
  return api.post<{ message: string }>(
    `/api/pools/${encodeURIComponent(pool)}/trim`,
    { stop },
  );
}

export function getPoolIostat(pool: string) {
  return api.get<Record<string, string | null>>(
    `/api/pools/${encodeURIComponent(pool)}/iostat`,
  );
}

export function getPoolHistory(pool: string) {
  return api.get<{ history: string[] }>(
    `/api/pools/${encodeURIComponent(pool)}/history`,
  );
}

export function importPool(pool: string, force = false) {
  return api.post<{ message: string }>(
    `/api/pools/${encodeURIComponent(pool)}/import`,
    { force },
  );
}

export function exportPool(pool: string) {
  return api.post<{ message: string }>(
    `/api/pools/${encodeURIComponent(pool)}/export`,
  );
}

// --- Datasets ---

export interface DatasetSummary {
  name: string;
  used: string;
  avail: string;
  refer: string;
  mountpoint: string;
  compression: string;
}

export function listDatasets(pool?: string, type = "filesystem,volume") {
  const params = new URLSearchParams({ type });
  if (pool) params.set("pool", pool);
  return api.get<DatasetSummary[]>(`/api/datasets?${params}`);
}

export function getDatasetProperties(name: string) {
  return api.get<Record<string, { value: string; source: string }>>(
    `/api/datasets/${encodePath(name)}/properties`,
  );
}

export function createDataset(body: {
  name: string;
  volume_size?: string;
  properties?: Record<string, string>;
}) {
  return api.post<{ message: string }>("/api/datasets", body);
}

export function destroyDataset(
  name: string,
  confirm: string,
  recursive = false,
  force = false,
) {
  return api.del<{ message: string }>(`/api/datasets/${encodePath(name)}`, {
    confirm,
    recursive,
    force,
  });
}

export function setDatasetProperties(
  name: string,
  properties: Record<string, string>,
) {
  return api.patch<{ message: string }>(
    `/api/datasets/${encodePath(name)}/properties`,
    { properties },
  );
}

export function mountDataset(name: string) {
  return api.post<{ message: string }>(
    `/api/datasets/${encodePath(name)}/mount`,
  );
}

export function unmountDataset(name: string) {
  return api.post<{ message: string }>(
    `/api/datasets/${encodePath(name)}/unmount`,
  );
}

export function shareDataset(
  name: string,
  protocol: "nfs" | "smb",
  options = "",
) {
  return api.post<{ message: string }>(
    `/api/datasets/${encodePath(name)}/share`,
    { protocol, options },
  );
}

export function unshareDataset(name: string) {
  return api.post<{ message: string }>(
    `/api/datasets/${encodePath(name)}/unshare`,
  );
}

export function getUserspace(name: string) {
  return api.get<Array<Record<string, string>>>(
    `/api/datasets/${encodePath(name)}/userspace`,
  );
}

// --- Snapshots ---

export interface SnapshotSummary {
  name: string;
  used: string;
  refer: string;
  creation: string;
}

export function listSnapshots(dataset: string) {
  return api.get<SnapshotSummary[]>(
    `/api/snapshots/${encodePath(dataset)}/snapshots`,
  );
}

export function createSnapshot(
  dataset: string,
  name: string,
  recursive = false,
) {
  return api.post<{ message: string }>(
    `/api/snapshots/${encodePath(dataset)}/snapshots`,
    { name, recursive },
  );
}

export function destroySnapshot(snapshot: string, confirm: string) {
  return api.del<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}`,
    { confirm },
  );
}

export function rollbackSnapshot(
  snapshot: string,
  confirm: string,
  destroyNewer = false,
) {
  return api.post<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}/rollback`,
    { confirm, destroy_newer: destroyNewer },
  );
}

export function cloneSnapshot(snapshot: string, target: string) {
  return api.post<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}/clone`,
    { target },
  );
}

export function diffSnapshots(snapA: string, snapB: string) {
  return api.get<Array<{ change_type: string; path: string; new_path?: string }>>(
    `/api/snapshots/${encodePath(snapA)}/diff/${encodePath(snapB)}`,
  );
}

export function holdSnapshot(snapshot: string, tag: string) {
  return api.post<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}/hold`,
    { tag },
  );
}

export function releaseHold(snapshot: string, tag: string) {
  return api.del<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}/hold/${encodeURIComponent(tag)}`,
  );
}

export function listHolds(snapshot: string) {
  return api.get<Array<{ name: string; tag: string; timestamp: string }>>(
    `/api/snapshots/${encodePath(snapshot)}/holds`,
  );
}

export function createBookmark(snapshot: string, name: string) {
  return api.post<{ message: string }>(
    `/api/snapshots/${encodePath(snapshot)}/bookmark`,
    { name },
  );
}

export function listBookmarks(dataset: string) {
  return api.get<Array<{ name: string; creation: string }>>(
    `/api/snapshots/${encodePath(dataset)}/bookmarks`,
  );
}

// --- Replication ---

export interface ReplicationJob {
  id: string;
  name: string;
  source: string;
  destination: string;
  direction: string;
  ssh_host: string;
  ssh_user: string;
  recursive: number;
  raw_send: number;
  compressed: number;
  schedule: string;
  enabled: number;
  last_run: number | null;
  last_status: string | null;
  last_bytes: number | null;
  created_at: number;
}

export function listReplicationJobs() {
  return api.get<ReplicationJob[]>("/api/replication/jobs");
}

export function createReplicationJob(body: {
  name: string;
  source: string;
  destination: string;
  direction?: string;
  ssh_host?: string;
  ssh_user?: string;
  recursive?: boolean;
  raw_send?: boolean;
  compressed?: boolean;
  schedule?: string;
}) {
  return api.post<{ id: string; message: string }>("/api/replication/jobs", body);
}

export function deleteReplicationJob(id: string) {
  return api.del<{ message: string }>(`/api/replication/jobs/${id}`);
}

// --- System ---

export function getSystemVersion() {
  return api.get<{ zfs_version: string; zpool_version: string }>(
    "/api/system/version",
  );
}

export function listDisks() {
  return api.get<{ devices: Array<Record<string, unknown>> }>(
    "/api/system/disks",
  );
}

export function getArcStats() {
  return api.get<{
    size: number;
    max_size: number;
    hit_rate: number;
    miss_rate: number;
    mru_size: number;
    mfu_size: number;
    l2_size?: number;
    l2_hit_rate?: number;
    raw: Record<string, number>;
  }>("/api/system/arc");
}

export function getAuditLog(limit = 100, offset = 0) {
  return api.get<
    Array<{
      id: number;
      timestamp: number;
      username: string;
      action: string;
      target: string;
      detail: string;
      success: number;
    }>
  >(`/api/system/audit?limit=${limit}&offset=${offset}`);
}

export function healthCheck() {
  return api.get<{ status: string; zfs: boolean; zpool: boolean }>(
    "/api/health",
  );
}
