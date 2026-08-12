#!/bin/sh
set -eu

echo "[backend] aguardando banco e aplicando migrations..."
npx prisma migrate deploy

echo "[backend] iniciando API..."
exec node dist/server.js
