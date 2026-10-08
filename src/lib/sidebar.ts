/**
 * Sidebar UI preference (NOT application data — a cosmetic setting).
 * Stored in a cookie so the server renders the right width on the first paint (no layout jump).
 *   "open" | "collapsed" = explicit user choice; "auto" = no choice yet (collapsed on tablet, open on desktop).
 */
export const SIDEBAR_COOKIE = "acca_sidebar";
export type SidebarPref = "open" | "collapsed" | "auto";
export const isSidebarPref = (v: unknown): v is "open" | "collapsed" => v === "open" || v === "collapsed";
/** Below this width the permanent sidebar does not fit and a drawer is used instead. */
export const SIDEBAR_DRAWER_BELOW_PX = 768;
/** From this width the sidebar is open by default. */
export const SIDEBAR_OPEN_FROM_PX = 1024;
