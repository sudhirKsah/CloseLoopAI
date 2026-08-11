"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

export function useApi<T>(path: string) {
  const { token, loading: authLoading } = useAuth();
  const [data, setData] = useState<T | undefined>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(Boolean(path));
  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false);
      setError("Please select or create a workspace to get started.");
      return;
    }
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }, [path, token]);
  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [reload, authLoading]);
  return { data, error, loading, reload };
}
