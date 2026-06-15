"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (googleToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Always start null/true on both server and client — consistent initial HTML
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Runs only on the client after hydration — safe to access localStorage
    try {
      const token = localStorage.getItem("token");
      const saved = localStorage.getItem("user");
      if (token && saved) {
        setUser(JSON.parse(saved) as User);
      }
    } catch {}
    setLoading(false);
  }, []);

  const login = async (googleToken: string) => {
    const data = await api("/auth/google", {
      method: "POST",
      body: { credential: googleToken },
    });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
