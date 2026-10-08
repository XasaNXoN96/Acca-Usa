"use client";

import { useEffect, useRef } from "react";

interface NavigationLike {
  addEventListener(type: "navigate", cb: (e: NavigateEventLike) => void): void;
  removeEventListener(type: "navigate", cb: (e: NavigateEventLike) => void): void;
}
interface NavigateEventLike {
  navigationType: "push" | "replace" | "reload" | "traverse";
  cancelable: boolean;
  preventDefault(): void;
}

/**
 * Warns before the user loses an unfinished test.
 *  - beforeunload: tab close, refresh, hard navigation (browser-native prompt)
 *  - Navigation API (where supported): intercepts browser Back and opens our own dialog
 * In-app exits go through the explicit "Exit test" dialog. Call `allow()` right before an
 * intentional navigation (submit / confirmed leave).
 */
export function useLeaveGuard(active: boolean, onBlocked: () => void) {
  const allowed = useRef(false);
  const blocked = useRef(onBlocked);

  useEffect(() => {
    blocked.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowed.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
    const onNavigate = (e: NavigateEventLike) => {
      if (allowed.current) return;
      if (e.navigationType === "traverse" && e.cancelable) {
        e.preventDefault();
        blocked.current();
      }
    };
    nav?.addEventListener("navigate", onNavigate);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      nav?.removeEventListener("navigate", onNavigate);
    };
  }, [active]);

  return { allow: () => void (allowed.current = true) };
}
