export const THEME_COOKIE = "acca_theme";
export const themes = ["light", "dark", "system"] as const;
export type Theme = (typeof themes)[number];
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (themes as readonly string[]).includes(v);

/**
 * Runs in <head> BEFORE first paint (blocking, static string — no user input) so there is no theme flash:
 * explicit choices are already on <html> from the server; "system" is resolved here via matchMedia.
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var t=m?m[1]:"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.dataset.theme=t;}catch(_){}})();`;
