"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, authToken, clearAuthToken, setAuthToken, type Me } from "./api";

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
    // 只有本平台明确回复未登录或已停用时才清掉令牌；网络抖动先重试，不把人踢下线。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const user = await api<Me>("/api/auth/me");
        setMe(user);
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.fromApi && (error.status === 401 || error.status === 403)) {
          clearAuthToken();
          setMe(null);
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    setMe(null);
    return null;
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
