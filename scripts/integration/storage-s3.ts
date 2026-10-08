/**
 * Integration test for ProductionStorageProvider against an in-process S3-compatible stub + local PostgreSQL.
 * Verifies OUR request construction and metadata handling (put / stat / exists / ranged open / signed URL / replace /
 * delete / garbage collection). It does not prove compatibility with a specific vendor — see docs/STORAGE.md.
 *
 *   DATABASE_URL=… npm run test:storage
 */
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import assert from "node:assert/strict";
import { ProductionStorageProvider } from "../../src/services/storage/production-provider";
import { getPrisma } from "../../src/lib/prisma";

const objects = new Map<string, Buffer>();
const seen: { method: string; path: string; auth: boolean }[] = [];

const body = (req: IncomingMessage) => new Promise<Buffer>((resolve) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

/** aws-chunked bodies carry "<hex>;chunk-signature=…\r\n<data>\r\n" frames; decode them back into plain bytes. */
function decodeAwsChunked(buf: Buffer): Buffer {
  const out: Buffer[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf("\r\n", pos);
    if (nl < 0) break;
    const size = parseInt(buf.subarray(pos, nl).toString().split(";")[0]!, 16);
    if (!size) break;
    out.push(buf.subarray(nl + 2, nl + 2 + size));
    pos = nl + 2 + size + 2;
  }
  return Buffer.concat(out);
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "").split("?")[0]!);
  seen.push({ method: req.method ?? "", path, auth: !!req.headers.authorization || (req.url ?? "").includes("X-Amz-Signature") });
  if (req.method === "PUT") {
    let data = await body(req);
    if (String(req.headers["content-encoding"] ?? "").includes("aws-chunked") || req.headers["x-amz-content-sha256"] === "STREAMING-UNSIGNED-PAYLOAD-TRAILER") data = decodeAwsChunked(data);
    objects.set(path, data);
    res.writeHead(200, { ETag: '"stub"' }).end();
  } else if (req.method === "GET" || req.method === "HEAD") {
    const obj = objects.get(path);
    if (!obj) return void res.writeHead(404, { "Content-Type": "application/xml" }).end("<Error><Code>NoSuchKey</Code></Error>");
    const m = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
    const slice = m ? obj.subarray(Number(m[1]), Number(m[2]) + 1) : obj;
    res.writeHead(m ? 206 : 200, { "Content-Length": slice.length, "Content-Type": "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : slice);
  } else if (req.method === "DELETE") {
    objects.delete(path);
    res.writeHead(204).end();
  } else res.writeHead(405).end();
});

async function main() {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const provider = new ProductionStorageProvider({
    endpoint: `http://127.0.0.1:${port}`, region: "us-east-1", bucket: "test-bucket", accessKeyId: "AKIATEST", secretAccessKey: "secret", forcePathStyle: true,
  });
  const prisma = getPrisma();
  await prisma.storedFile.deleteMany({});
  const content = Buffer.from("0123456789".repeat(100));
  const file = new File([content], "../../etc/pass wd.pdf", { type: "application/pdf" });

  const meta = await provider.put({ ownerId: "owner-1", file, mime: "application/pdf" });
  assert.match(meta.id, /^[0-9a-f-]{36}$/);
  assert.equal(meta.storageKey, `files/${meta.id}`, "key is server-generated");
  assert.ok(!meta.name.includes("/") && !meta.name.includes(".."), "file name is sanitised");
  assert.equal(meta.attached, false);
  assert.deepEqual(objects.get(`/test-bucket/files/${meta.id}`), content, "bytes reach the bucket");
  assert.ok(seen.every((s) => s.auth), "every request is signed");

  assert.equal((await provider.stat(meta.id))?.size, content.length);
  assert.equal(await provider.stat("../../etc/passwd"), null, "ids are validated");
  assert.equal(await provider.exists(meta.id), true);
  assert.equal(await provider.exists("00000000-0000-0000-0000-000000000000"), false);

  const opened = await provider.open(meta.id, { start: 10, end: 19 });
  assert.ok(opened);
  assert.equal(Buffer.from(await new Response(opened.stream).arrayBuffer()).toString(), "0123456789");
  assert.equal(opened.start, 10);
  assert.equal(opened.end, 19);

  const url = await provider.signedUrl(meta.id, { ttlSeconds: 60, download: true });
  assert.ok(url, "signed URL issued");
  assert.ok(url.includes("X-Amz-Signature") && url.includes("X-Amz-Expires=60"), "signed URL is time-limited");
  assert.ok(url.includes("attachment"), "download disposition is part of the signature");
  assert.equal(await provider.signedUrl("00000000-0000-0000-0000-000000000000"), null);

  await provider.markAttached(meta.id, true);
  assert.equal((await provider.stat(meta.id))?.attached, true);

  const next = await provider.replace(meta.id, { ownerId: "owner-1", file: new File([Buffer.from("new")], "b.pdf"), mime: "application/pdf" });
  assert.notEqual(next.id, meta.id);
  assert.equal(await provider.stat(meta.id), null, "old object metadata removed");
  assert.equal(objects.has(`/test-bucket/files/${meta.id}`), false, "old bytes removed");

  await prisma.storedFile.update({ where: { id: next.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  assert.equal(await provider.collectGarbage(86_400_000), 1, "unattached uploads are collected");
  assert.equal(objects.size, 0);
  console.log("storage-s3: all checks passed");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { server.close(); await getPrisma().$disconnect(); });
