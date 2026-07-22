import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuthState } from "@/services/auth";
import { registerDeviceForPush } from "@/services/notifications";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = watchAuthState((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        registerDeviceForPush(u.uid).catch((err) =>
          console.warn("[auth] push registration failed", err)
        );
      }
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
