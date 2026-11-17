#!/bin/sh
# deploy_haplograph.sh - deploy the HaploGraph web app on gm-web01 (same conventions as deploy_haploblocks.sh).
# Run as root in /opt/deploy:  sh deploy_haplograph.sh
#   - pulls the repo (if it is a git checkout)
#   - uses dist/ from the repo (built on the workstation with `npm run build`; no Node needed here),
#     or builds it here when npm is available and dist/ is missing
#   - rsyncs dist/ to the web root and leaves WEB_DIR/data (the tiles) untouched
set -eu
APP_DIR=/home/gmadmin/haplograph-chord
WEB_DIR=/var/www/haplograph.haploblocks.org
BACKUP_DIR=/var/www/backups/haplograph.haploblocks.org
STAMP=$(date +%Y%m%d_%H%M%S)

[ -d "$APP_DIR" ] || { echo "no such directory: $APP_DIR" >&2; exit 1; }
cd "$APP_DIR"
if [ -d .git ]; then
  echo "[deploy] git pull"
  git pull --ff-only
fi

if [ ! -f dist/index.html ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "[deploy] dist/ missing, building"
    npm ci
    npm run build
  else
    echo "dist/index.html not found and npm is not installed. Run 'npm run build' on the workstation and commit dist/." >&2
    exit 1
  fi
fi

mkdir -p "$WEB_DIR/data" "$BACKUP_DIR"
if [ -f "$WEB_DIR/index.html" ]; then
  tar -czf "$BACKUP_DIR/site_$STAMP.tar.gz" -C "$WEB_DIR" --exclude=./data .
  echo "[deploy] backup: $BACKUP_DIR/site_$STAMP.tar.gz"
fi

# --exclude protects the tiles (and anything else under data/) from --delete.
rsync -a --delete --exclude='data/' dist/ "$WEB_DIR/"

chown -R root:nginx "$WEB_DIR"
find "$WEB_DIR" -type d -exec chmod 755 {} +
find "$WEB_DIR" -type f -exec chmod 644 {} +
restorecon -R "$WEB_DIR" 2>/dev/null || true

nginx -t
systemctl reload nginx
echo "[deploy] done: https://haplograph.haploblocks.org/"
