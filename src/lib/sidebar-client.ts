"use client";

import { SIDEBAR_COOKIE, SIDEBAR_OPEN_FROM_PX, type SidebarPref } from "./sidebar";

const listeners = new Set<() => void>();
const shell = () => document.querySelector<HTMLElement>(".app-shell");
const desktopQuery = () => window.matchMedia(`(min-width: ${SIDEBAR_OPEN_FROM_PX}px)`);

export function subscribeSidebar(cb: () => void) {
  listeners.add(cb);
  const mq = desktopQuery(); // "auto" depends on the viewport width
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

/** Effective state: explicit choice wins; "auto" = collapsed below 1024px. */
export function getCollapsedSnapshot(): boolean {
  const pref = (shell()?.dataset.sidebar ?? "auto") as SidebarPref;
  if (pref === "collapsed") return true;
  if (pref === "open") return false;
  return !desktopQuery().matches;
}
export const getServerCollapsedSnapshot = () => false;

export function setSidebarPref(pref: "open" | "collapsed") {
  const el = shell();
  if (el) el.dataset.sidebar = pref;
  document.cookie = `${SIDEBAR_COOKIE}=${pref}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  listeners.forEach((l) => l());
}
