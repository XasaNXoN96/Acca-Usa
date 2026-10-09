import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, statSync, openSync, readSync, closeSync } from "node:fs";
import { pipeline } from "node:stream/promises";

export const MAGIC = Buffer.from("ACCABK1\n"); // header of an encrypted backup
export interface PgTarget { host: string; port: string; user: string; password: string; database: string }

export function parsePgUrl(url: string): PgTarget {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("not a PostgreSQL URL");
  return { host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.slice(1)) };
}

/** libpq environment: credentials never appear in argv (process lists, shell history, CI logs). */
export const pgEnv = (t: PgTarget): NodeJS.ProcessEnv => ({
  ...process.env, PGHOST: t.host, PGPORT: t.port, PGUSER: t.user, PGPASSWORD: t.password, PGDATABASE: t.database, PGCONNECT_TIMEOUT: "15",
});

export function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { status: 127, stdout: "", stderr: `${cmd}: ${r.error.message}` };
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), h);
  return h.digest("hex");
}

const key = (passphrase: string, salt: Buffer) => scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

/** AES-256-GCM, scrypt-derived key. Layout: MAGIC | salt(16) | iv(12) | ciphertext | tag(16). */
export async function encryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  const out = createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(src), c, out, { end: false });
  out.end(c.getAuthTag());
  await new Promise<void>((res, rej) => { out.on("finish", res); out.on("error", rej); });
}

export const isEncrypted = (path: string) => {
  const fd = openSync(path, "r");
  try { const b = Buffer.alloc(MAGIC.length); readSync(fd, b, 0, b.length, 0); return b.equals(MAGIC); } finally { closeSync(fd); }
};

/** Throws on a wrong passphrase or any modification (GCM tag). */
export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const size = statSync(src).size;
  const head = Buffer.alloc(MAGIC.length + 16 + 12), tag = Buffer.alloc(16);
  const fd = openSync(src, "r");
  try { readSync(fd, head, 0, head.length, 0); readSync(fd, tag, 0, 16, size - 16); } finally { closeSync(fd); }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not an encrypted ACCA backup");
  const d = createDecipheriv("aes-256-gcm", key(passphrase, head.subarray(MAGIC.length, MAGIC.length + 16)), head.subarray(MAGIC.length + 16));
  d.setAuthTag(tag);
  await pipeline(createReadStream(src, { start: head.length, end: size - 17 }), d, createWriteStream(dest, { mode: 0o600 }));
}

export interface Manifest {
  format: 1;
  createdAt: string;
  database: string;
  serverVersion: string;
  pgDump: string;
  migrations: string[];
  tables: Record<string, number>;
  audit: { events: number; head: string | null };
  file: { name: string; bytes: number; sha256: string; encrypted: boolean };
}
