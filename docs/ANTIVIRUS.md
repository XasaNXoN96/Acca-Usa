# Antivirus scanning of uploads (ClamAV)

Every file an administrator uploads (video, audio, PDF, slides, images, documents, archives) can be scanned by **ClamAV** before a single student can open it.
The application talks to the ClamAV daemon (`clamd`) over its `INSTREAM` protocol: the file is streamed to the daemon, never held in memory
and never written to an extra place. Nothing is simulated — with `ANTIVIRUS_PROVIDER=none` nothing is scanned.

## Behaviour

| | |
|---|---|
| `ANTIVIRUS_PROVIDER=clamav` | the upload is stored as `UPLOADED` (not served), the worker (or the web process right after the upload) scans it; clean → `READY` (video/audio then continue to FFmpeg); **infected → `REJECTED / VIRUS_FOUND`, never served, never retried** |
| scanner not running / unreachable | the file **waits** (`FAILED / SCANNER_UNAVAILABLE`), the retry budget is not used, it is scanned automatically when `clamd` is back; the admin sees "The virus scanner is not reachable" |
| scanner gives garbage or no answer | treated as *unavailable* — never as "clean" |
| `ANTIVIRUS_PROVIDER=none` | explicit choice (the server refuses to start without one of the two in production); type / signature / size checks still apply, nothing is scanned |

Rejected files stay out of every student view; the admin sees the reason in the material form (RU / EN / UZ). A `upload.virus_found` line (file id + signature name, no content) is written to the log.

## Install on the VPS (Ubuntu)

```bash
sudo apt -y install clamav clamav-daemon
sudo systemctl stop clamav-freshclam && sudo freshclam          # first download of the signature database (needs internet, ~300 MB)
sudo systemctl enable --now clamav-freshclam                    # keeps signatures up to date automatically
```

Edit `/etc/clamav/clamd.conf` so that big uploads are accepted (the defaults stop at 25 MB, our videos reach 150 MB):

```
StreamMaxLength 200M
MaxFileSize 200M
MaxScanSize 400M
TCPSocket 3310
TCPAddr 127.0.0.1          # loopback only — never expose clamd to the network
```

Then `sudo systemctl restart clamav-daemon`, check `echo PING | nc 127.0.0.1 3310` → `PONG`, and put in the application's env file:

```
ANTIVIRUS_PROVIDER=clamav
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
```

(`CLAMAV_SOCKET=/run/clamav/clamd.ctl` works instead of host/port if the web user may read the socket.) `clamd` keeps the signatures in RAM: plan **≈ 1.5–2 GB** for it on the 8 GB server (`docs/VPS_DEPLOYMENT.md` § sizing).
The web service and the worker units start after `clamav-daemon` (see the unit files).

## What was verified here — and what was not

* **TESTED**: `npm run test:antivirus` against a local *test double* of clamd that speaks the real framing: clean / infected (EICAR) verdicts, a 70 MB stream, infected file → `REJECTED` and never served, scanner down → file waits and is scanned when it returns, garbage / silent scanner → never "clean".
* **TESTED once, by hand, against a real `clamd` 1.5 process** with a *local test signature* (the sandbox had no internet for the real database): clean text, EICAR in a PDF, EICAR inside a ZIP, 150 MB clean stream, EICAR at the end of a 120 MB stream — all correct.
* **NOT TESTED**: detection quality with the real, current signature database (that is ClamAV's job, not ours), `freshclam` updates, memory use on the production server, behaviour under real upload load.
* Antivirus is one layer, not a guarantee: new malware may not be in the database yet. Keep the other layers (allow-listed types, signature checks, no HTML/SVG, view-only students, private bucket).
