# Load tests and capacity (what was measured, what was not)

**Status: measured on a developer sandbox, NOT on the VPS.** The numbers show where the limits are and how the code behaves under load; they are not a promise for the real server.
Re-run `scripts/load-test.mjs` against your **staging** server from another machine before the launch (instructions at the end).

## How it was measured

* Sandbox: server, PostgreSQL 16, an S3 stand-in and `clamd` were all pinned to **2 cores** (`taskset`), the load generator used the other two. The CPU model differs from a VPS; the S3 stand-ins (a Python emulator, then a Node emulator `s3rver`) are **slower than MinIO**, and the video bytes never crossed a real network.
* Production build (`NEXT_PUBLIC_APP_MODE=production`), PostgreSQL provider, real FFmpeg, a 107 MB lecture video, Nginx 1.24 in front (HTTPS, HTTP/2, gzip) for the offload runs.
* Tools: `autocannon` for pages; `scripts/load-test.mjs` for video viewers (each paced like a player at 2.5 Mbit/s, range requests, buffer model) and students browsing pages at the same time.

## Results

| Scenario | Result |
|---|---|
| Student dashboard (the heaviest page, ≈150 KB HTML, ≈50 database queries) | ≈ 50 ms per request alone; **≈ 28 renders/s** at saturation with 16 parallel clients (it was ≈ 20/s before the catalogue snapshot was shared between requests). The Node process is CPU-bound here, not the database. |
| Login | one password check = **≈ 80 ms of CPU** (scrypt, deliberately slow); 40 at once ≈ 0.7 s. 300 students logging in the same minute is fine; 300 in the same second queue for ≈ 10–20 s. |
| Video through the Node app (default) | up to **≈ 400 Mbit/s** total in the sandbox ⇒ ≈ 100 viewers at 2.5 Mbit/s with **0 stalls**; at 200 viewers most players stall. |
| Video with Nginx offload (`FILE_DELIVERY=nginx`) | up to ≈ 500–550 Mbit/s; 100 viewers: 0 stalls, 150 viewers with 4 MB ranges: 2 stalls. The limit in the sandbox was CPU shared by Nginx TLS, the S3 emulator and the rest. |
| 60 viewers + 40 students browsing | video fine (0 stalls), pages p50 0.4 s |
| 100 viewers + 60 browsing (4 MB ranges) | video fine, **page tail latency p95 ≈ 11 s** — the 2 cores were saturated |
| Upload of a 107 MB video | 2–3 s, server memory grew ≈ 100 MB (streamed, not buffered) |
| 70 MB / 150 MB / 120 MB streams through ClamAV | scanned in ≈ 1–1.5 s |

## What this means for 2 vCPU / 8 GB / 80 GB NVMe

* **Comfortable:** ≈ 50–100 students watching video **at the same time** plus ≈ 40–60 students browsing — if the VPS has an uplink of at least 250 Mbit/s. A 10 Mbit/s uplink (some CPU plans) serves **4 viewers**, whatever the CPU.
* **≈ 300–600 students active in the same hour** (each loads a page every few seconds–minute) is realistic for the page rendering capacity of 2 cores (≈ 20–30 dashboard renders per second).
* **Beyond ≈ 100 simultaneous viewers or ≈ 30 page renders/s:** move to 4 cores, or put video behind a CDN / on provider object storage with its own bandwidth, or run a second Node instance (`next start -p 3001`, add to the Nginx `upstream`).
* The first thing to run out is **uplink bandwidth**, then CPU (video encryption in Nginx + page rendering), then disk space (see `docs/VPS_DEPLOYMENT.md` sizing).

## Behaviour under overload (checked)

* Slow responses, not errors: no 5xx and no crashes in any run above (errors 0, except a test setup with too few Nginx connections — documented below).
* Uploads, antivirus outage, storage outage, worker restart: see `docs/DEPLOYMENT_STATUS.md`.
* Nginx: raise `worker_connections` (e.g. `4096`) and `worker_rlimit_nofile 8192;` in `/etc/nginx/nginx.conf` — each viewer holds connections; the Ubuntu default (768) logs "worker_connections are not enough" at a few hundred viewers.

## Not measured

Real MinIO / provider storage speed; real network; the actual VPS CPU; Let's Encrypt TLS cost on the VPS CPU; thousands of registered users in the database (the sandbox had ≈ 10 users and the demo catalogue of 79 topics / 151 materials — page cost grows with the catalogue, the shared catalogue snapshot limits that, but a library of tens of thousands of questions was **not** tested); mobile networks; a second Node instance.

## Running the test yourself (staging only — never against production with real students)

```bash
# 1. in the staging admin upload one video, attach it to a material of a platform a TEST student has access to; note the file id
# 2. from ANOTHER machine, with the test student's session cookie value (from your own browser, never shared):
BASE=https://staging.example.com STUDENT_COOKIE=… VIDEO_FILE_ID=… \
VIEWERS=50 PAGE_USERS=30 PAGES="/dashboard,/courses" CHUNK_MB=4 SECONDS=60 node scripts/load-test.mjs
# repeat with VIEWERS=100, 150 … until "stalls" or page p95 grows; that is your real ceiling
```
