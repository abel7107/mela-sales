#!/bin/sh
# Proves a backup restores: loads it into a throwaway database and counts rows. Usage: ./scripts/restore-test.sh backups/<file>.sql.gz
set -eu
FILE="$1"
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS restore_check; CREATE DATABASE restore_check"'
gunzip -c "$FILE" | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" restore_check'
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" restore_check -e "SELECT COUNT(*) AS sales FROM Sale; SELECT COUNT(*) AS invoices FROM Invoice;"'
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE restore_check"'
echo "restore test OK"
