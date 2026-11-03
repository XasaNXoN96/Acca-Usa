/**
 * Preflight: "is this server ready to run ACCA USA?" — one command before the first start and after every change.
 *   npm run preflight                     reads the same environment as the app (on the VPS: sudo -u acca bash -c 'set -a; . /etc/acca-usa/acca-usa.env; set +a; cd /srv/acca-usa && npm run preflight')
 *   npm run preflight -- --url https://example.com    also checks the public site (HTTPS, health, security headers) from this machine
 * Prints OK / WARN / FAIL per check and exits 1 on any FAIL. It writes ONE tiny test object to the bucket (and deletes it) and sends no e-mail.
 * It never prints a secret: only names, hosts, versions and reasons.
 */
import { execFile } from "node:child_process";
import { readdirSync, statfsSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { validateEnv } from "../src/lib/env-check";

const run = promisify(execFile);
type Level = "OK" | "WARN" | "FAIL";
const rows: { level: Level; name: string; detail: string }[] = [];
const add = (level: Level, name: string, detail = "") => { rows.push({ level, name, detail }); console.log(`${level === "OK" ? "  ok  " : level === "WARN" ? " WARN " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`); };
const guard = async (name: string, fn: () => Promise<[Level, string?] | void>) => {
  try { const r = await fn(); add(r ? r[0] : "OK", name, r ? (r[1] ?? "") : ""); } catch (e) { add("FAIL", name, e instanceof Error ? `${e.name}: ${e.message}`.replace(/\s+/g, " ").slice(0, 160) : "unknown error"); }
};
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const withTimeout = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

async function main() {
  console.log("ACCA USA preflight\n");
  const env = process.env;
  const { mode, issues } = validateEnv(env);

  await guard("Node.js version", async () => { const v = process.versions.node; const [maj, min] = v.split(".").map(Number); if (maj! < 20 || (maj === 20 && min! < 9)) return ["FAIL", `${v} (need >= 20.9)`]; return ["OK", v]; });
  await guard("configuration (names only)", async () => {
    if (mode !== "production") return ["WARN", "NEXT_PUBLIC_APP_MODE is not 'production': this is a demo configuration"];
    if (issues.length) return ["FAIL", issues.map((i) => `${i.name} (${i.reason})`).join("; ")];
    return ["OK", `production, payments=${env.PAYMENTS_PROVIDER}, currency=${env.PRICE_CURRENCY ?? "USD"}, antivirus=${env.ANTIVIRUS_PROVIDER}`];
  });
  if (mode !== "production") { console.log("\nThe remaining checks need a production configuration."); return finish(); }

  // ── PostgreSQL + migrations
  const prisma = new PrismaClient();
  await guard("PostgreSQL connection", async () => { await withTimeout(prisma.$queryRaw`SELECT 1`, 8000, "database"); const h = new URL(env.DATABASE_URL!).host; return ["OK", h]; });
  await guard("database migrations applied", async () => {
    const dir = join(process.cwd(), "prisma", "migrations");
    const onDisk = readdirSync(dir).filter((d) => /^\d{14}_/.test(d)).sort();
    const applied = (await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM _prisma_migrations`).filter((m) => m.finished_at).map((m) => m.migration_name);
    const missing = onDisk.filter((m) => !applied.includes(m));
    if (missing.length) return ["FAIL", `${missing.length} not applied (run: npx prisma migrate deploy): ${missing.slice(0, 3).join(", ")}`];
    return ["OK", `${applied.length} applied`];
  });
  await guard("reference data (platforms ACCA / FIA)", async () => { const n = await prisma.platform.count(); return n >= 2 ? ["OK", `${n} platforms`] : ["FAIL", "no platforms — run: npm run db:bootstrap"]; });
  await guard("first administrator", async () => { const n = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } }); return n > 0 ? ["OK", `${n} administrator(s)`] : ["WARN", "none yet — create with: npm run admin:create"]; });
  await guard("no demo accounts in this database", async () => { const n = await prisma.user.count({ where: { email: { in: ["admin@example.com", "student@example.com"] } } }); return n === 0 ? ["OK"] : ["FAIL", "demo accounts with PUBLIC passwords exist — this database must be recreated"]; });
  await prisma.$disconnect().catch(() => undefined);

  // ── object storage: put, read, delete one tiny object
  await guard("object storage (bucket reachable, write / read / delete)", async () => {
    const s3 = new S3Client({
      region: env.S3_REGION, endpoint: env.S3_ENDPOINT || undefined, forcePathStyle: env.S3_FORCE_PATH_STYLE === "1",
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    });
    const Bucket = env.S3_BUCKET!; const Key = `preflight/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    await withTimeout(s3.send(new HeadBucketCommand({ Bucket })), 10000, "bucket");
    await withTimeout(s3.send(new PutObjectCommand({ Bucket, Key, Body: "preflight", ContentType: "text/plain" })), 10000, "write");
    const got = await withTimeout(s3.send(new GetObjectCommand({ Bucket, Key })), 10000, "read"); const text = await got.Body!.transformToString();
    await s3.send(new DeleteObjectCommand({ Bucket, Key }));
    return text === "preflight" ? ["OK", `${env.S3_ENDPOINT ? new URL(env.S3_ENDPOINT).host : "AWS"} / ${Bucket}`] : ["FAIL", "read-back differs"];
  });

  // ── e-mail (connection + login only: nothing is sent)
  await guard("SMTP server (connect + login, nothing is sent)", async () => {
    const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT), secure: env.SMTP_SECURE === "1" || env.SMTP_PORT === "465", auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
    await t.verify(); return ["OK", `${env.SMTP_HOST}:${env.SMTP_PORT}`];
  });

  // ── FFmpeg
  await guard("FFmpeg + ffprobe with libx264 and AAC", async () => {
    const ff = env.FFMPEG_PATH || "ffmpeg", fp = env.FFPROBE_PATH || "ffprobe";
    const v = (await run(ff, ["-version"])).stdout.split("\n")[0]!; await run(fp, ["-version"]);
    const enc = (await run(ff, ["-hide_banner", "-encoders"])).stdout;
    const missing = ["libx264", " aac "].filter((e) => !enc.includes(e));
    return missing.length ? ["FAIL", `encoder missing: ${missing.join(", ").trim()}`] : ["OK", v.replace(/ Copyright.*/, "")];
  });

  // ── antivirus
  if (env.ANTIVIRUS_PROVIDER === "clamav") {
    await guard("ClamAV daemon answers (PING)", async () => {
      const answer = await withTimeout(new Promise<string>((resolve, reject) => {
        const s = env.CLAMAV_SOCKET ? connect({ path: env.CLAMAV_SOCKET }) : connect({ host: env.CLAMAV_HOST || "127.0.0.1", port: Number(env.CLAMAV_PORT) || 3310 });
        let data = ""; s.on("error", reject); s.on("data", (d) => { data += d.toString(); }); s.on("close", () => resolve(data)); s.on("connect", () => s.write("zPING\0"));
      }), 8000, "clamd");
      return answer.replace(/\0/g, "").trim() === "PONG" ? ["OK", "PONG"] : ["FAIL", `unexpected answer: ${answer.slice(0, 40)}`];
    });
  } else add("WARN", "antivirus", "ANTIVIRUS_PROVIDER=none: uploads are NOT scanned");

  // ── Telegram (notifications + second factor + support): optional, but you asked for it — so a missing bot is a warning, a broken one a failure
  if (env.TELEGRAM_BOT_TOKEN) {
    await guard("Telegram bot (token valid, webhook registered)", async () => {
      const { telegramCall } = await import("../src/services/telegram/client");
      const me = await telegramCall<{ username?: string }>("getMe"); if (!me.ok) return ["FAIL", `Telegram refused the token (${me.code})`];
      const info = await telegramCall<{ url?: string; last_error_message?: string }>("getWebhookInfo"); if (!info.ok) return ["FAIL", `getWebhookInfo failed (${info.code})`];
      const want = `${(env.APP_URL ?? "").replace(/\/$/, "")}/api/telegram/webhook`;
      if (!info.result.url) return ["FAIL", "no webhook registered — run: npm run telegram:setup"];
      if (info.result.url !== want) return ["WARN", `webhook points to ${info.result.url} (expected ${want})`];
      if (info.result.last_error_message) return ["WARN", `Telegram reports: ${info.result.last_error_message}`];
      return ["OK", `@${me.result.username}`];
    });
  } else add("WARN", "Telegram bot", "not configured: no notifications, no Telegram sign-in codes, no support messages (docs/TELEGRAM.md)");

  // ── disk
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  for (const [label, path, minGb] of [["media scratch space", env.MEDIA_TMP_DIR || "/tmp", 5], ["backup directory", env.BACKUP_DIR || "", 5], ["application disk", process.cwd(), 5]] as const) {
    if (!path) { add("WARN", label, "BACKUP_DIR is not set: no local backups will be written"); continue; }
    await guard(`free disk: ${label}`, async () => { const f = statfsSync(path); const free = Number(f.bavail) * Number(f.bsize); return free < minGb * 1024 ** 3 ? ["WARN", `${gb(free)} free at ${path} (< ${minGb} GB)`] : ["OK", `${gb(free)} free`]; });
  }
  if (!env.BACKUP_PASSPHRASE) add("WARN", "backup passphrase", "BACKUP_PASSPHRASE is not set in this environment (needed by the backup job)");

  // ── the public site (optional)
  const url = arg("--url");
  if (url) {
    await guard(`public site ${url}`, async () => {
      if (!url.startsWith("https://")) return ["FAIL", "must be https://"];
      const r = await withTimeout(fetch(`${url.replace(/\/$/, "")}/api/health?ready=1`, { redirect: "manual" }), 15000, "site");
      const h = r.headers;
      const miss = [["strict-transport-security", /max-age=\d{7,}/], ["x-content-type-options", /nosniff/], ["referrer-policy", /./]].filter(([n, re]) => !(re as RegExp).test(h.get(n as string) ?? "")).map(([n]) => n);
      if (r.status !== 200) return ["FAIL", `/api/health?ready=1 answered ${r.status}`];
      if (h.get("x-powered-by")) return ["WARN", "X-Powered-By header is exposed"];
      return miss.length ? ["WARN", `missing headers: ${miss.join(", ")}`] : ["OK", "health ok, HSTS + nosniff present"];
    });
    for (const [port, what] of [[3000, "the Node app"], [5432, "PostgreSQL"], [9000, "MinIO"], [3310, "ClamAV"]] as const) {
      const host = new URL(url).hostname;
      await guard(`port ${port} (${what}) is NOT reachable from here`, async () => {
        const open = await new Promise<boolean>((resolve) => { const s = connect({ host, port, timeout: 3000 }); s.on("connect", () => { s.destroy(); resolve(true); }); s.on("timeout", () => { s.destroy(); resolve(false); }); s.on("error", () => resolve(false)); });
        return open ? ["FAIL", `${host}:${port} accepts connections from the internet — close it in the firewall`] : ["OK"];
      });
    }
  }
  finish();
}

function finish() {
  const f = rows.filter((r) => r.level === "FAIL").length, w = rows.filter((r) => r.level === "WARN").length;
  console.log(`\n${rows.length} checks: ${rows.length - f - w} ok, ${w} warning(s), ${f} FAILED`);
  process.exit(f ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
