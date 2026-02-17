import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  refetch: () => void;
}

/**
 * Hook for REST API calls with loading/error state management.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => listPools());
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const execute = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcher();
      setState({ data, loading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body.error
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setState({ data: null, loading: false, error: message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { ...state, refetch: execute };
}

/**
 * Hook for mutating API calls (POST, PUT, DELETE, PATCH).
 *
 * Usage:
 *   const { execute, loading, error } = useMutation(
 *     (name: string) => createPool({ name, vdevs: ["mirror", "sda", "sdb"] })
 *   );
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(...args);
        setLoading(false);
        return result;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.body.error
            : err instanceof Error
              ? err.message
              : "Unknown error";
        setError(message);
        setLoading(false);
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutator],
  );

  return { execute, loading, error };
}
