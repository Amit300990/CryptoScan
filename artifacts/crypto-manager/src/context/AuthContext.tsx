import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setAuthTokenGetter, customFetch } from "@workspace/api-client-react";

interface User {
  id: number;
  email: string;
  name?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoaded: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "cg_auth_token";

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  setAuthTokenGetter(() => token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  setAuthTokenGetter(null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoaded: false });

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState({ user: null, token: null, isLoaded: true });
      return;
    }
    setAuthTokenGetter(() => token);
    customFetch<User>("/api/auth/me")
      .then((user) => setState({ user, token, isLoaded: true }))
      .catch(() => {
        clearToken();
        setState({ user: null, token: null, isLoaded: true });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await customFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeToken(res.token);
    setState({ user: res.user, token: res.token, isLoaded: true });
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await customFetch<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    storeToken(res.token);
    setState({ user: res.user, token: res.token, isLoaded: true });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ user: null, token: null, isLoaded: true });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
