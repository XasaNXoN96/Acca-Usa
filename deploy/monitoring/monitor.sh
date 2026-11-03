#!/usr/bin/env bash
# ACCA USA health monitor (run every 5 minutes by acca-usa-monitor.timer). Checks the things that silently break a launch:
#   site health (incl. database), free disk, TLS certificate expiry, newest database backup, ClamAV, the web + worker services.
# On a PROBLEM (and again every 6 hours while it lasts) and when it RECOVERS it logs to journald and, if configured, sends a message:
#   ALERT_TELEGRAM_TOKEN + ALERT_TELEGRAM_CHAT   (a Telegram bot you created with @BotFather)   and / or   ALERT_WEBHOOK_URL (any URL that accepts a POST with JSON {"text": "..."})
# The same Telegram bot as the application can be used: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are accepted when ALERT_TELEGRAM_* are not set.
# Settings come from /etc/acca-usa/monitor.env (root:acca 0640; NOT in Git). Messages contain check names only — never secrets.
set -uo pipefail
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health?ready=1}"
DISK_PATHS="${DISK_PATHS:-/ /var/lib/minio /srv/minio-data}"        # paths that do not exist are skipped
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
CERT_HOST="${CERT_HOST:-}"                                            # e.g. example.com ; empty = skip
CERT_WARN_DAYS="${CERT_WARN_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-}"                                          # empty = skip
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
CLAMAV_HOST="${CLAMAV_HOST:-127.0.0.1}"; CLAMAV_PORT="${CLAMAV_PORT:-3310}"; CHECK_CLAMAV="${CHECK_CLAMAV:-1}"
SERVICES="${SERVICES:-acca-usa-web acca-usa-media-worker}"
ALERT_TELEGRAM_TOKEN="${ALERT_TELEGRAM_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"; ALERT_TELEGRAM_CHAT="${ALERT_TELEGRAM_CHAT:-${TELEGRAM_CHAT_ID:-}}"
STATE_DIR="${STATE_DIR:-/var/lib/acca-monitor}"
HOST_LABEL="${HOST_LABEL:-$(hostname)}"
mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR="/tmp/acca-monitor"; mkdir -p "$STATE_DIR"

problems=()
add() { problems+=("$1"); }

# 1. site + database
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)
[ "$code" = "200" ] || add "site health check failed (HTTP ${code:-none})"

# 2. disks
for p in $DISK_PATHS; do
  [ -d "$p" ] || continue
  used=$(df -P "$p" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')
  [ -n "${used:-}" ] && [ "$used" -ge "$DISK_WARN_PERCENT" ] && add "disk $p is ${used}% full"
done

# 3. TLS certificate
if [ -n "$CERT_HOST" ]; then
  end=$(echo | timeout 10 openssl s_client -servername "$CERT_HOST" -connect "$CERT_HOST:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$end" ]; then add "TLS certificate of $CERT_HOST could not be read"
  else days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 )); [ "$days" -lt "$CERT_WARN_DAYS" ] && add "TLS certificate of $CERT_HOST expires in ${days} days"; fi
fi

# 4. newest backup
if [ -n "$BACKUP_DIR" ]; then
  newest=$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.enc' \) -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  if [ -z "$newest" ]; then add "no database backup found in $BACKUP_DIR"
  else age=$(( ( $(date +%s) - ${newest%.*} ) / 3600 )); [ "$age" -gt "$BACKUP_MAX_AGE_HOURS" ] && add "newest database backup is ${age} hours old"; fi
fi

# 5. ClamAV
if [ "$CHECK_CLAMAV" = "1" ]; then
  pong=$( (exec 3<>"/dev/tcp/$CLAMAV_HOST/$CLAMAV_PORT" 2>/dev/null && printf 'PING\n' >&3 && timeout 3 cat <&3) 2>/dev/null | tr -d '\0\n')
  [ "$pong" = "PONG" ] || add "ClamAV does not answer"
fi

# 6. services
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  for s in $SERVICES; do systemctl is-active --quiet "$s" || add "service $s is not running"; done
fi

now=$(date +%s); state="$STATE_DIR/state"; sig=$(printf '%s\n' "${problems[@]:-}" | sort | md5sum | cut -d' ' -f1)
prev_sig=""; prev_time=0; [ -f "$state" ] && read -r prev_sig prev_time < "$state"
send() {
  local text="[$HOST_LABEL] $1"
  logger -t acca-monitor -p "$2" -- "$1" 2>/dev/null || echo "$text"
  [ -n "${ALERT_TELEGRAM_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT:-}" ] && curl -s -m 10 -o /dev/null "https://api.telegram.org/bot${ALERT_TELEGRAM_TOKEN}/sendMessage" --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT}" --data-urlencode "text=$text" || true
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -s -m 10 -o /dev/null -H 'content-type: application/json' -d "{\"text\": \"${text//\"/\\\"}\"}" "$ALERT_WEBHOOK_URL" || true
}
if [ "${#problems[@]}" -gt 0 ]; then
  if [ "$sig" != "$prev_sig" ] || [ $(( now - prev_time )) -ge 21600 ]; then
    send "PROBLEM: $(IFS='; '; echo "${problems[*]}")" user.err
    echo "$sig $now" > "$state"
  fi
  exit 1
fi
if [ -n "$prev_sig" ] && [ "$prev_sig" != "ok" ]; then send "RECOVERED: all checks pass again" user.notice; fi
echo "ok $now" > "$state"
exit 0
