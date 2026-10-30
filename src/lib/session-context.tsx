"use client";

/**
 * Session context — the client's single source of truth.
 *
 * Holds the anonymous session credentials (id + token) in localStorage so a user
 * can return to their plan across reloads, and the latest secret-free session
 * state from the server. All mutations go through the API and update this store.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, type OptionsResponse } from "@/lib/api-client";
import { cacheClear, cacheGet, cacheSet } from "@/lib/client-cache";
import type { PlanSummary } from "@/lib/decision/engine";
import type { PublicSession } from "@/lib/api/serialize";

const ID_KEY = "lookahead.sessionId";
const TOKEN_KEY = "lookahead.sessionToken";

interface SessionContextValue {
  ready: boolean;
  id: string | null;
  token: string | null;
  session: PublicSession | null;
  loadError: string | null;
  /** Create a brand-new session (used from the welcome screen). */
  create: () => Promise<PublicSession>;
  /** Re-fetch the current session from the server. */
  refresh: () => Promise<void>;
  /** Adopt a session returned by a mutation. */
  setSession: (s: PublicSession) => void;
  /** Privacy reset: delete server-side data and clear local credentials. */
  reset: () => Promise<void>;
  clearLoadError: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStored(): { id: string | null; token: string | null } {
  if (typeof window === "undefined") return { id: null, token: null };
  try {
    return { id: window.localStorage.getItem(ID_KEY), token: window.localStorage.getItem(TOKEN_KEY) };
  } catch {
    return { id: null, token: null };
  }
}

function writeStored(id: string, token: string): void {
  try {
    window.localStorage.setItem(ID_KEY, id);
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage may be unavailable (private mode); the session still works in-memory.
  }
}

function clearStored(): void {
  try {
    window.localStorage.removeItem(ID_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSessionState] = useState<PublicSession | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const warmedFor = useRef<string | null>(null);

  // On first mount, try to resume a stored session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStored();
      if (stored.id && stored.token) {
        setId(stored.id);
        setToken(stored.token);
        try {
          const { session: s } = await api.getSession(stored.id, stored.token);
          if (!cancelled) setSessionState(s);
        } catch {
          // Stale/expired/deleted — drop the credentials so a fresh one is made.
          if (!cancelled) {
            clearStored();
            setId(null);
            setToken(null);
          }
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (): Promise<PublicSession> => {
    const { token: t, session: s } = await api.createSession();
    writeStored(s.id, t);
    setId(s.id);
    setToken(t);
    setSessionState(s);
    setLoadError(null);
    return s;
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const stored = readStored();
    if (!stored.id || !stored.token) return;
    try {
      const { session: s } = await api.getSession(stored.id, stored.token);
      setSessionState(s);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your session.");
    }
  }, []);

  const setSession = useCallback((s: PublicSession) => setSessionState(s), []);

  const reset = useCallback(async (): Promise<void> => {
    const stored = readStored();
    if (stored.id && stored.token) {
      try {
        await api.deleteSession(stored.id, stored.token);
      } catch {
        // Best-effort server deletion; always clear locally.
      }
    }
    clearStored();
    cacheClear();
    setId(null);
    setToken(null);
    setSessionState(null);
    setLoadError(null);
  }, []);

  const clearLoadError = useCallback(() => setLoadError(null), []);

  // Warm the journey caches (options + plan) as soon as a session exists, so
  // navigating to Rehearse or Plan renders instantly — no spinner, ever, even on
  // the first visit. Pages still revalidate in the background on mount.
  useEffect(() => {
    if (!ready || !id || !token || !session) return;
    if (warmedFor.current === id) return;
    warmedFor.current = id;
    const needOptions = !cacheGet<OptionsResponse>(`options:${id}`);
    const needPlan = !cacheGet<PlanSummary>(`plan:${id}`);
    if (!needOptions && !needPlan) return;
    void (async () => {
      try {
        if (needOptions && needPlan) {
          const [opts, planRes] = await Promise.all([api.getOptions(id, token), api.getPlan(id, token)]);
          cacheSet(`options:${id}`, opts);
          cacheSet(`plan:${id}`, planRes.plan);
        } else if (needOptions) {
          cacheSet(`options:${id}`, await api.getOptions(id, token));
        } else {
          const planRes = await api.getPlan(id, token);
          cacheSet(`plan:${id}`, planRes.plan);
        }
      } catch {
        // Warming is best-effort; each screen fetches for itself if this fails.
      }
    })();
  }, [ready, id, token, session]);

  const value = useMemo<SessionContextValue>(
    () => ({ ready, id, token, session, loadError, create, refresh, setSession, reset, clearLoadError }),
    [ready, id, token, session, loadError, create, refresh, setSession, reset, clearLoadError]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
