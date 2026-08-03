#!/usr/bin/env bash
set -Eeuo pipefail

TEMP_DIR=/tmp/monochrome-importer

checksum() {
    find . -maxdepth 1 -type f \( -name '*.go' -o -name 'go.mod' \) -print0 \
        | sort -z \
        | xargs -0 sha256sum \
        | sha256sum \
        | cut -d ' ' -f 1
}

build() {
    mkdir -p "$TEMP_DIR"
    cp go.mod "$TEMP_DIR/dev.mod"
    echo "[importer] compiling..."
    if go build -mod=mod -modfile="$TEMP_DIR/dev.mod" -o "$TEMP_DIR/server" .; then
        return 0
    else
        echo "[importer] build failed; watching for the next change" >&2
        return 1
    fi
}

previous="$(checksum)"
until build; do
    while [[ "$(checksum)" == "$previous" ]]; do sleep 0.5; done
    previous="$(checksum)"
done

(
    while sleep 0.5; do
        if [[ "$(checksum)" != "$previous" ]]; then
            echo "[importer] source changed; restarting..."
            kill -TERM 1
            exit 0
        fi
    done
) &

echo "[importer] ready on http://127.0.0.1:${PORT:-8787}"
exec "$TEMP_DIR/server"
