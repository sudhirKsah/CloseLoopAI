"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@/lib/api";

/** Keeps FastAPI's bearer-token client and its local user record in sync with Clerk. */
export function SessionBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) { window.localStorage.removeItem("closeloop_token"); return; }
    void getToken().then(async token => {
      if (!token) return;
      window.localStorage.setItem("closeloop_token", token);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) await api("/auth/bootstrap", {method:"POST",body:JSON.stringify({display_name:user.fullName || user.username || email,email})});
      window.dispatchEvent(new Event("closeloop-session"));
    }).catch(() => undefined);
  }, [getToken, isLoaded, isSignedIn, user]);
  return null;
}
