'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/features/auth/session-provider';

type Result<T> = { key: string } & ({ data: T; error?: undefined } | { data?: undefined; error: unknown });

export function useParcelData<T>(path: string, schema: { parse(value: unknown): T }) {
  const { request } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = path + '#' + attempt;

  useEffect(() => {
    const controller = new AbortController();
    void request<unknown>(path, { signal: controller.signal }).then(raw => {
      const data = schema.parse(raw);
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, error });
    });
    return () => controller.abort();
  }, [key, path, request, schema]);

  return {
    result: result?.key === key ? result : null,
    retry: () => setAttempt(current => current + 1),
  };
}
