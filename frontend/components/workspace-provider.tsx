"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

type Workspace = { id: string; name: string; slug: string; role: string };
type Me = {
  id: string;
  name: string;
  email: string;
  is_email_verified?: boolean;
  notification_preferences?: Record<string, boolean>;
  workspaces: Workspace[];
};
type Value = {
  me?: Me;
  workspace?: Workspace;
  workspaceId: string;
  loading: boolean;
  error?: string;
  authReady: boolean;
  selectWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
};
const Context = createContext<Value | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, token, loading: authLoading } = useAuth();
  const [me, setMe] = useState<Me>();
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = async () => {
    if (!token) {
      setLoading(false);
      setAuthReady(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api<Me>("/auth/me");
      setMe(data);
      const stored = window.localStorage.getItem("closeloop_workspace_id");
      setActive(
        data.workspaces.some((x) => x.id === stored)
          ? (stored ?? "")
          : (data.workspaces[0]?.id ?? ""),
      );
      setError(undefined);
      setAuthReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace");
      setAuthReady(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) {
      setLoading(false);
      setAuthReady(false);
      return;
    }
    void refresh();
  }, [token, user, authLoading]);

  const selectWorkspace = (id: string) => {
    window.localStorage.setItem("closeloop_workspace_id", id);
    setActive(id);
  };
  const workspace = me?.workspaces.find((x) => x.id === active);
  const value = useMemo(
    () => ({
      me,
      workspace,
      workspaceId: active,
      loading,
      error,
      authReady,
      selectWorkspace,
      refresh,
    }),
    [me, workspace, active, loading, error, authReady],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider missing");
  return value;
}
