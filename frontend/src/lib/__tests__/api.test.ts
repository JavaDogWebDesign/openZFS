import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  api,
  ApiError,
  encodePath,
  login,
  logout,
  getMe,
  listPools,
  getPool,
  createPool,
  destroyPool,
  scrubPool,
  listDatasets,
  createSnapshot,
  destroySnapshot,
  healthCheck,
  getSystemVersion,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Response object that fetch would return. */
function mockResponse(body: unknown, init?: ResponseInit): Response {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init?.statusText ?? "OK",
    json: () => Promise.resolve(body),
    headers: new Headers(init?.headers),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------
describe("ApiError", () => {
  it("stores status and body", () => {
    const err = new ApiError(404, { error: "Not found" });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ error: "Not found" });
    expect(err.message).toBe("Not found");
  });
});

// ---------------------------------------------------------------------------
// encodePath
// ---------------------------------------------------------------------------
describe("encodePath", () => {
  it("encodes each segment of a ZFS path", () => {
    expect(encodePath("tank/data/child")).toBe("tank/data/child");
  });

  it("encodes special characters within segments", () => {
    // Segments with characters needing percent-encoding
    expect(encodePath("tank/my data/child")).toBe("tank/my%20data/child");
  });

  it("handles a single-segment name", () => {
    expect(encodePath("rpool")).toBe("rpool");
  });
});

// ---------------------------------------------------------------------------
// api.get / api.post / api.patch / api.del  (low-level)
// ---------------------------------------------------------------------------
describe("api convenience methods", () => {
  it("api.get sends a GET with no body and no CSRF header", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const result = await api.get<{ ok: boolean }>("/api/test");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/test");
    expect(opts.method).toBe("GET");
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect(opts.headers["X-Requested-With"]).toBeUndefined();
    expect(opts.credentials).toBe("same-origin");
  });

  it("api.post sends JSON body and CSRF header", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "ok" }));

    await api.post("/api/pools", { name: "tank" });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(opts.body).toBe(JSON.stringify({ name: "tank" }));
  });

  it("api.patch sends PATCH with JSON body", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "updated" }));

    await api.patch("/api/datasets/tank/properties", {
      properties: { compression: "lz4" },
    });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("PATCH");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("api.del sends DELETE with CSRF header", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "destroyed" }));

    await api.del("/api/pools/tank", { confirm: "tank" });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("DELETE");
    expect(opts.headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("api.post without a body omits Content-Type but still sends CSRF", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "exported" }));

    await api.post("/api/pools/tank/export");

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect(opts.headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(opts.body).toBeUndefined();
  });

  it("handles 204 No Content responses", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(null, { status: 204, statusText: "No Content" }),
    );

    const result = await api.del<void>("/api/something");
    expect(result).toBeUndefined();
  });

  it("throws ApiError on non-ok responses with JSON body", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(
        { error: "pool already exists" },
        { status: 409, statusText: "Conflict" },
      ),
    );

    await expect(api.post("/api/pools", { name: "tank" })).rejects.toThrow(
      ApiError,
    );

    try {
      await api.post("/api/pools", { name: "tank" });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).body.error).toBe("pool already exists");
    }
  });

  it("throws ApiError with statusText when error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
      headers: new Headers(),
    } as unknown as Response);

    try {
      await api.get("/api/broken");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).body.error).toBe("Internal Server Error");
    }
  });
});

// ---------------------------------------------------------------------------
// Domain API functions
// ---------------------------------------------------------------------------
describe("Auth API functions", () => {
  it("login sends POST to /api/auth/login with credentials", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ username: "admin", message: "Logged in" }),
    );

    const result = await login("admin", "secret");

    expect(result).toEqual({ username: "admin", message: "Logged in" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      username: "admin",
      password: "secret",
    });
  });

  it("logout sends POST to /api/auth/logout", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "Logged out" }));

    await logout();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/logout");
    expect(opts.method).toBe("POST");
  });

  it("getMe sends GET to /api/auth/me", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ username: "admin" }),
    );

    const result = await getMe();

    expect(result).toEqual({ username: "admin" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/me");
    expect(opts.method).toBe("GET");
  });
});

describe("Pool API functions", () => {
  it("listPools sends GET to /api/pools", async () => {
    const pools = [
      { name: "tank", size: "10G", alloc: "5G", free: "5G", fragmentation: "10%", capacity: "50%", health: "ONLINE" },
    ];
    fetchMock.mockResolvedValue(mockResponse(pools));

    const result = await listPools();

    expect(result).toEqual(pools);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pools");
  });

  it("getPool sends GET to /api/pools/:name", async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: {}, properties: {} }));

    await getPool("tank");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/pools/tank");
  });

  it("getPool URL-encodes the pool name", async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: {}, properties: {} }));

    await getPool("my pool");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/pools/my%20pool");
  });

  it("createPool sends POST to /api/pools with body", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "Pool created" }));

    await createPool({
      name: "tank",
      vdevs: ["mirror", "sda", "sdb"],
      force: true,
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pools");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      name: "tank",
      vdevs: ["mirror", "sda", "sdb"],
      force: true,
    });
  });

  it("destroyPool sends DELETE to /api/pools/:name with confirm body", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "Pool destroyed" }));

    await destroyPool("tank", "tank", true);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pools/tank");
    expect(opts.method).toBe("DELETE");
    expect(JSON.parse(opts.body)).toEqual({ confirm: "tank", force: true });
  });

  it("scrubPool sends POST with action", async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: "Scrub started" }));

    await scrubPool("tank", "start");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pools/tank/scrub");
    expect(JSON.parse(opts.body)).toEqual({ action: "start" });
  });
});

describe("Dataset API functions", () => {
  it("listDatasets sends GET with query params", async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await listDatasets("tank", "filesystem");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/datasets?");
    expect(url).toContain("type=filesystem");
    expect(url).toContain("pool=tank");
  });

  it("listDatasets defaults to filesystem,volume type", async () => {
    fetchMock.mockResolvedValue(mockResponse([]));

    await listDatasets();

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("type=filesystem%2Cvolume");
  });
});

describe("Snapshot API functions", () => {
  it("createSnapshot sends POST with name and recursive flag", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ message: "Snapshot created" }),
    );

    await createSnapshot("tank/data", "snap1", true);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/snapshots/tank/data/snapshots");
    expect(JSON.parse(opts.body)).toEqual({ name: "snap1", recursive: true });
  });

  it("destroySnapshot sends DELETE with confirm", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ message: "Snapshot destroyed" }),
    );

    await destroySnapshot("tank/data@snap1", "tank/data@snap1");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/snapshots/tank/data%40snap1");
    expect(opts.method).toBe("DELETE");
  });
});

describe("System API functions", () => {
  it("healthCheck sends GET to /api/health", async () => {
    const health = { status: "ok", zfs: true, zpool: true };
    fetchMock.mockResolvedValue(mockResponse(health));

    const result = await healthCheck();

    expect(result).toEqual(health);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/health");
  });

  it("getSystemVersion sends GET to /api/system/version", async () => {
    const version = { zfs_version: "2.2.4", zpool_version: "5000" };
    fetchMock.mockResolvedValue(mockResponse(version));

    const result = await getSystemVersion();

    expect(result).toEqual(version);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/system/version");
  });
});
