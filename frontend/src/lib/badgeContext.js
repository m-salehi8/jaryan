import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const BadgeContext = createContext({ pendingCount: 0 });

export function BadgeProvider({ children }) {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const retryCountRef = useRef(0);
  const timerRef = useRef(null);

  const fetchBadge = useCallback(async () => {
    try {
      const r = await api.get("/tasks?assigned_to_me=true&status=pending");
      setPendingCount(r.data.length);
      retryCountRef.current = 0;
    } catch {
      if (retryCountRef.current < 3) {
        retryCountRef.current++;
        setTimeout(fetchBadge, 10000);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) {
      clearInterval(timerRef.current);
      setPendingCount(0);
      return;
    }

    fetchBadge();

    const startPolling = () => {
      timerRef.current = setInterval(() => {
        if (!document.hidden) fetchBadge();
      }, 30000);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timerRef.current);
      } else {
        fetchBadge();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchBadge, user]);

  return <BadgeContext.Provider value={{ pendingCount }}>{children}</BadgeContext.Provider>;
}

export const useBadge = () => useContext(BadgeContext);
