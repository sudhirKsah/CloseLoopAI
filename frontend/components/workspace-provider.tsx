"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Workspace = { id:string; name:string; slug:string; role:string };
type Me = { id:string; name:string; email:string; workspaces:Workspace[] };
type Value = { me?:Me; workspace?:Workspace; workspaceId:string; loading:boolean; error?:string; selectWorkspace:(id:string) => void; refresh:() => Promise<void> };
const Context = createContext<Value | null>(null);
export function WorkspaceProvider({ children }: { children:React.ReactNode }) {
  const [me,setMe] = useState<Me>(); const [active,setActive] = useState(""); const [loading,setLoading] = useState(true); const [error,setError] = useState<string>();
  const refresh = async () => { setLoading(true); try { const data = await api<Me>("/auth/me"); setMe(data); const stored = window.localStorage.getItem("closeloop_workspace_id"); setActive(data.workspaces.some(x => x.id === stored) ? stored ?? "" : data.workspaces[0]?.id ?? ""); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load workspace"); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); const handle = () => void refresh(); window.addEventListener("closeloop-session", handle); return () => window.removeEventListener("closeloop-session", handle); }, []);
  const selectWorkspace = (id:string) => { window.localStorage.setItem("closeloop_workspace_id",id); setActive(id); };
  const workspace = me?.workspaces.find(x => x.id === active);
  const value = useMemo(() => ({me,workspace,workspaceId:active,loading,error,selectWorkspace,refresh}), [me,workspace,active,loading,error]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error("WorkspaceProvider missing"); return value; }
