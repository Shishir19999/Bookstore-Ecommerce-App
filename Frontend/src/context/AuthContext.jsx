import { useCallback, useEffect, useState } from "react";
import { api, getToken, TOKEN_KEY } from "../api";

import { AuthCtx } from "./authContextObject";

const saveToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!getToken());

  // Restore session from stored token
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api("/api/auth/me")
      .then((data) => !cancelled && setUser(data.user))
      .catch((err) => {
        // Only drop the token when the server rejected it, not on network errors
        if (err.status === 401) saveToken(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = async (path, body) => {
    const data = await api(path, { method: "POST", body, token: "" });
    saveToken(data.token);
    setUser(data.user);
  };

  const login = (email, password) => authenticate("/api/auth/login", { email, password });
  const register = (name, email, password) =>
    authenticate("/api/auth/register", { name, email, password });
  // Revokes the token server-side (tokenVersion bump), then clears local state regardless of the outcome.
  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* offline or already revoked: still log out locally */
    }
    saveToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export default AuthProvider;
