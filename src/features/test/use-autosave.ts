"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Debounced autosave with automatic retry. The persistence target is injected
 * (a server action) — drafts live on the server, never in localStorage.
 * `value` must be referentially stable between real changes (useMemo).
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<boolean>, { delay = 1200, retryDelay = 4000, enabled = true } = {}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const saveRef = useRef(save);
  const first = useRef(true);

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      setStatus("saving");
      saveRef.current(value).then(
        (ok) => {
          if (cancelled) return;
          if (ok) setStatus("saved");
          else {
            setStatus("failed");
            retry = setTimeout(run, retryDelay);
          }
        },
        () => {
          if (cancelled) return;
          setStatus("failed");
          retry = setTimeout(run, retryDelay);
        },
      );
    };

    const timer = setTimeout(run, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [value, delay, retryDelay, enabled]);

  return status;
}
