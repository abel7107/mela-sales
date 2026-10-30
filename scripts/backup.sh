#!/bin/sh
# Usage (cron, daily): ./scripts/backup.sh   Keeps 14 days of compressed dumps in ./backups
set -eu
mkdir -p backups
F="backups/mela_sales_$(date +%Y%m%d_%H%M%S).sql.gz"
docker compose exec -T db sh -c 'mysqldump --single-transaction --routines -uroot -p"$MYSQL_ROOT_PASSWORD" mela_sales' | gzip > "$F"
find backups -name 'mela_sales_*.sql.gz' -mtime +14 -delete
echo "backup written: $F"
