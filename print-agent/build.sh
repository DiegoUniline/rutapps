#!/usr/bin/env sh
# Compila el agente y lo deja en public/descargas para que se sirva desde rutapp.mx
set -e
cd "$(dirname "$0")"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../public/descargas/RutappImpresora.exe .
