#!/bin/sh
# tools/install-training-cron.sh — install (or refresh) the nightly bot-training job on the game box. Idempotent.
#
#   04:30  export + prune + train   (skipped, with a log line, while a match is running)
#   05:30  one retry
#
# Run as root on the box:  sh tools/install-training-cron.sh
# Uninstall:               crontab -l | grep -v '# sp-bot-training' | crontab -
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TAG='# sp-bot-training'
JOB="cd $ROOT && nice -n 19 ionice -c3 node tools/train-bot.mjs --auto >> var/training/auto.log 2>&1"

if ! command -v crontab >/dev/null 2>&1; then
  echo "[sp] no crontab on this machine; add this to your scheduler instead:" >&2
  echo "  30 4 * * * $JOB" >&2
  exit 1
fi
mkdir -p "$ROOT/var/training"
{
  crontab -l 2>/dev/null | grep -v "$TAG" || true
  echo "30 4 * * * $JOB $TAG"
  echo "30 5 * * * $JOB $TAG"
} | crontab -
echo "[sp] installed:"
crontab -l | grep "$TAG"
