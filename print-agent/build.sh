#!/usr/bin/env sh
# Build local sin firma (Windows). El build firmado de Windows + Mac lo hace
# .github/workflows/print-agent.yml y lo deja en public/descargas.
set -e
cd "$(dirname "$0")"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../public/descargas/RutappImpresora.exe .
