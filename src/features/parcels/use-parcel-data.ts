'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/features/auth/session-provider';

type Result<T> = { key: string; path: string } & ({ data: T; error?: undefined } | { data?: undefined; error: unknown });

export function useParcelData<T>(path: string, schema: { parse(value: unknown): T }) {
  const { request } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = path + '#' + attempt;

  useEffect(() => {
    const controller = new AbortController();
    void request<unknown>(path, { signal: controller.signal }).then(raw => {
      const data = schema.parse(raw);
      if (!controller.signal.aborted) setResult({ key, path, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, path, error });
    });
    return () => controller.abort();
  }, [key, path, request, schema]);

  return {
    // Keep a successful result mounted only while the same path refreshes, so slot components can preserve safe local
    // input (notably a selected proof after a 409). A different path never shows the previous path's data.
    result: result?.key === key || (result?.path === path && result.data) ? result : null,
    retry: () => {
      setResult(current => current?.data ? current : null);
      setAttempt(current => current + 1);
    },
  };
}
