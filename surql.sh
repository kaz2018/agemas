#!/bin/bash
source "$(dirname "$0")/.env"

echo "$1" | surreal sql \
  --endpoint "$SURREALDB_ENDPOINT" \
  --username "$SURREALDB_USER" \
  --password "$SURREALDB_PASS" \
  --namespace "$SURREALDB_NS" \
  --database "$SURREALDB_DB" \
  --pretty
