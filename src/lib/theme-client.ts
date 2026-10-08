"use client";

import { THEME_COOKIE, isTheme, type Theme } from "./theme";

/** Tiny external store so every theme control stays in sync without prop drilling. */
const listeners = new Set<() => void>();

export function subscribeTheme(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getThemeSnapshot(): Theme {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : "system";
}
export const getServerThemeSnapshot = (): Theme => "system";

function resolve(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolve(theme));
  document.documentElement.dataset.theme = theme;
}

/** Persists the choice in a cookie (so the server renders the right theme on reload) and applies it now. */
export function setTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  applyTheme(theme);
  listeners.forEach((l) => l());
}
