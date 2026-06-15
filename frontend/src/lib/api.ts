// API client for Mini Cursor backend
const API_BASE = "/api";

// SSE streaming MUST bypass the Next.js rewrite proxy — Next.js buffers the
// entire response before forwarding it, which breaks real-time streaming.
// Call the backend directly instead.
const STREAM_BASE = (typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  : "http://localhost:8000");

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api(path: string, options: RequestOptions = {}) {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.detail || error.message || "Request failed");
  }

  return res.json();
}

// SSE streaming helper
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function streamAgent(
  projectId: string | null,
  prompt: string,
  activeFile: string | null,
  history: ConversationMessage[],
  onEvent: (event: string, data: unknown) => void,
  onError: (error: string) => void,
  onDone: () => void,
  sessionId?: string | null,
) {
  const token = localStorage.getItem("token");

  // Use STREAM_BASE (direct to backend) — bypasses Next.js proxy buffering
  fetch(`${STREAM_BASE}/agent/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: projectId ?? null,
      prompt,
      active_file: activeFile ?? null,
      history: Array.isArray(history) ? history.slice(-10) : [],
      session_id: sessionId ?? null,
    }),
  }).then(async (response) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventType = "";
    let currentDataLines: string[] = [];

    const dispatch = () => {
      if (!currentEventType && !currentDataLines.length) return;
      const rawData = currentDataLines.join("\n");
      currentDataLines = [];
      const etype = currentEventType;
      currentEventType = "";
      if (!rawData && !etype) return;
      try {
        const parsed = rawData ? JSON.parse(rawData) : {};
        onEvent(etype, parsed);
      } catch {
        onEvent(etype, rawData);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          // Blank line = end of one SSE event
          dispatch();
        } else if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentDataLines.push(line.slice(6));
        }
        // ignore comment lines (": ping...")
      }
    }

    dispatch(); // flush anything remaining

    onDone();
  }).catch((err) => {
    onError(err.message);
  });
}
