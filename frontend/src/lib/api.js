import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "jaryan_token";
const USER_KEY = "jaryan_user";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || localStorage.getItem("raahkar_token");
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("raahkar_token");
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("raahkar_user");
};
export const getCachedUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
  catch { return null; }
};
export const setCachedUser = (u) => localStorage.setItem(USER_KEY, JSON.stringify(u));

export const api = axios.create({ baseURL: API_BASE });
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});


export async function streamAI(message, sessionId, onDelta, onDone, onError) {
  const token = getToken();
  const resp = await fetch(`${API_BASE}/ai/generate-workflow/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!resp.ok || !resp.body) {
    onError?.(new Error("AI request failed"));
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    let eventType = "message";
    for (const line of lines) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const data = line.slice(5).trim().replace(/\\n/g, "\n");
        if (eventType === "done") {
          try { onDone?.(JSON.parse(data)); }
          catch { onDone?.(null); }
          return;
        } else if (eventType === "error") {
          onError?.(new Error(data));
          return;
        } else {
          onDelta?.(data);
        }
      } else if (line.trim() === "") {
        eventType = "message";
      }
    }
  }
}
