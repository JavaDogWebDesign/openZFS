import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useApi, useMutation } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// useApi
// ---------------------------------------------------------------------------
describe("useApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns data after a successful fetch", async () => {
    const pools = [{ name: "tank", health: "ONLINE" }];
    const fetcher = vi.fn().mockResolvedValue(pools);

    const { result } = renderHook(() => useApi(fetcher));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(pools);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sets error when fetcher rejects with a plain Error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("network down");
  });

  it("extracts error body from ApiError", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(403, { error: "Forbidden" }));

    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Forbidden");
  });

  it("handles non-Error throw values gracefully", async () => {
    const fetcher = vi.fn().mockRejectedValue("string-error");

    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Unknown error");
  });

  it("re-fetches data when refetch is called", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({ count: callCount });
    });

    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ count: 1 });

    // Trigger refetch
    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 2 });
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("re-executes when dependency array changes", async () => {
    const fetcher = vi.fn().mockResolvedValue("result");

    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useApi(fetcher, [dep]),
      { initialProps: { dep: 1 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    // Change the dependency
    rerender({ dep: 2 });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// useMutation
// ---------------------------------------------------------------------------
describe("useMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle (not loading, no error)", () => {
    const mutator = vi.fn();
    const { result } = renderHook(() => useMutation(mutator));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns the result from a successful mutation", async () => {
    const mutator = vi
      .fn()
      .mockResolvedValue({ message: "Pool created" });

    const { result } = renderHook(() => useMutation(mutator));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.execute("tank");
    });

    expect(returnValue).toEqual({ message: "Pool created" });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mutator).toHaveBeenCalledWith("tank");
  });

  it("sets loading to true while the mutation is in-flight", async () => {
    let resolve!: (val: unknown) => void;
    const mutator = vi.fn(
      () => new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useMutation(mutator));

    // Start the mutation but do not await it yet
    let executePromise: Promise<unknown>;
    act(() => {
      executePromise = result.current.execute();
    });

    // Should be loading now
    expect(result.current.loading).toBe(true);

    // Resolve the mutation
    await act(async () => {
      resolve({ ok: true });
      await executePromise!;
    });

    expect(result.current.loading).toBe(false);
  });

  it("sets error on ApiError rejection and returns null", async () => {
    const mutator = vi
      .fn()
      .mockRejectedValue(new ApiError(422, { error: "Invalid vdev spec" }));

    const { result } = renderHook(() => useMutation(mutator));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.execute();
    });

    expect(returnValue).toBeNull();
    expect(result.current.error).toBe("Invalid vdev spec");
    expect(result.current.loading).toBe(false);
  });

  it("sets error on plain Error rejection", async () => {
    const mutator = vi
      .fn()
      .mockRejectedValue(new Error("timeout"));

    const { result } = renderHook(() => useMutation(mutator));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe("timeout");
  });

  it("handles non-Error throw values gracefully", async () => {
    const mutator = vi.fn().mockRejectedValue(42);

    const { result } = renderHook(() => useMutation(mutator));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe("Unknown error");
  });

  it("passes multiple arguments through to the mutator", async () => {
    const mutator = vi
      .fn()
      .mockImplementation(
        (a: string, b: number, c: boolean) =>
          Promise.resolve({ a, b, c }),
      );

    const { result } = renderHook(() => useMutation(mutator));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.execute("hello", 42, true);
    });

    expect(mutator).toHaveBeenCalledWith("hello", 42, true);
    expect(returnValue).toEqual({ a: "hello", b: 42, c: true });
  });

  it("clears previous error on a new successful execute", async () => {
    const mutator = vi
      .fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useMutation(mutator));

    // First call - fails
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.error).toBe("first fail");

    // Second call - succeeds, error should be cleared
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.error).toBeNull();
  });
});
