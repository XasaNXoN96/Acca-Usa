/**
 * Files are always served through /api/files/[id]: session-checked server-side, nosniff, correct Content-Type.
 * `download=true` only works for administrators (the route refuses it for students).
 */
export const fileUrl = (id: string, download = false) => `/api/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
