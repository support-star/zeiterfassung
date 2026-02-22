import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useQuery<T>(path: string | null, deps: any[] = []): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!path) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path);
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Fehler beim Laden');
    } finally {
      setIsLoading(false);
    }
  }, [path, ...deps]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

export function useMutation<TBody = unknown, TResult = unknown>() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: TBody,
  ): Promise<TResult | undefined> => {
    setIsLoading(true);
    setError(null);
    try {
      let result: TResult | undefined;
      if (method === 'POST') result = await api.post<TResult>(path, body);
      else if (method === 'PATCH') result = await api.patch<TResult>(path, body);
      else result = await api.del<TResult>(path);
      return result;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ein Fehler ist aufgetreten';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error, clearError: () => setError(null) };
}
