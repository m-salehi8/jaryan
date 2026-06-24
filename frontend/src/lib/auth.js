import { createContext, useContext, useEffect, useState } from "react";
import { api, clearToken, getCachedUser, setCachedUser, setToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("raahkar_token");
    if (!t) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => { setUser(r.data); setCachedUser(r.data); })
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setToken(r.data.token);
    setCachedUser(r.data.user);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
