"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, authToken, clearAuthToken, setAuthToken, type Me } from "./api";

type SessionValue = {
  me: Me | null | undefined;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  me: undefined,
  refresh: async () => null,
  logout: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!authToken()) {
      setMe(null);
      return null;
    }
    try {
      const user = await api<Me>("/api/auth/me");
      setMe(user);
      return user;
    } catch {
      clearAuthToken();
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      if (authToken()) await api("/api/auth/logout", { method: "POST", json: {} });
    } catch {
      /* 本地会话一并清掉 */
    }
    clearAuthToken();
    setMe(null);
  }, []);

  return <SessionContext.Provider value={{ me, refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export async function loginWith(email: string, password: string, refresh: () => Promise<Me | null>) {
  const result = await api<{ token: string; user: Me }>("/api/auth/login", {
    json: { email, password },
    token: null,
  });
  setAuthToken(result.token);
  await refresh();
  return result.user;
}
