#!/usr/bin/env bash
# ACCA USA backup job (run by acca-usa-backup.timer, or by hand as the `acca` user).
#   1. PostgreSQL: encrypted dump + manifest into $BACKUP_DIR (npm run db:backup)
#   2. optional OFF-SERVER copy of $BACKUP_DIR with rclone (BACKUP_REMOTE=remote:path) — copies only, never deletes remotely
#   3. optional copy of the file bucket into a SECOND bucket with rclone (FILES_REPLICA_REMOTE=replica:bucket) — copies only
# Exit status is non-zero if any configured step fails, so `systemctl status` / journald show it. No secret is ever printed.
# What this does NOT do: it does not prove the backup restores. Run the drills in docs/BACKUP_AND_RESTORE.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

log() { printf '{"t":"%s","event":"%s"%s}\n' "$(date -u +%FT%TZ)" "$1" "${2:+,$2}"; }
: "${BACKUP_DIR:?BACKUP_DIR is not set (see /etc/acca-usa/backup.env)}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set — database backups contain personal data and must be encrypted}"
status=0

if npm run --silent db:backup >/dev/null; then log backup.db_ok; else log backup.db_failed; exit 1; fi

if [ -n "${BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null || { log backup.offsite_failed '"reason":"rclone not installed"'; exit 1; }
  # `copy` never deletes at the destination; keep remote retention in the provider (lifecycle / object lock).
  if rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --immutable --checksum >/dev/null 2>&1; then log backup.offsite_ok; else log backup.offsite_failed; status=1; fi
else
  log backup.offsite_not_configured '"warning":"backups exist only on this server"'
fi

if [ -n "${FILES_REPLICA_REMOTE:-}" ]; then
  command -v rclone >/dev/null || { log backup.files_failed '"reason":"rclone not installed"'; exit 1; }
  : "${FILES_SOURCE_REMOTE:?FILES_SOURCE_REMOTE (rclone remote of the primary bucket, e.g. primary:acca-files) is not set}"
  if rclone copy "$FILES_SOURCE_REMOTE" "$FILES_REPLICA_REMOTE" --checksum --transfers 4 >/dev/null 2>&1; then log backup.files_ok; else log backup.files_failed; status=1; fi
else
  log backup.files_not_configured '"warning":"uploaded files are not copied anywhere by this job"'
fi
exit "$status"
