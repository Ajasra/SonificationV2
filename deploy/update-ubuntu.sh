#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_VERSION="0.28.1"
PB_BINARY="$APP_DIR/pocketbase"

for command in npm pm2; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if [[ ! -x "$PB_BINARY" ]]; then
  for command in curl unzip install; do
    if ! command -v "$command" >/dev/null 2>&1; then
      echo "Required command not found: $command" >&2
      exit 1
    fi
  done

  case "$(uname -m)" in
    x86_64|amd64) PB_ARCH="amd64" ;;
    aarch64|arm64) PB_ARCH="arm64" ;;
    *) echo "Unsupported PocketBase architecture: $(uname -m)" >&2; exit 1 ;;
  esac

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  PB_ZIP="pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip"
  curl --fail --location --silent --show-error \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${PB_ZIP}" \
    --output "$TMP_DIR/pocketbase.zip"
  unzip -q "$TMP_DIR/pocketbase.zip" pocketbase -d "$TMP_DIR"
  install -m 0755 "$TMP_DIR/pocketbase" "$PB_BINARY"
  echo "Installed PocketBase ${PB_VERSION} (${PB_ARCH})."
fi

cd "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" && -f "$APP_DIR/.env.example" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "Initialized .env from .env.example"
fi

npm ci
npm run build:backend
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

echo "Sonopticon is running under PM2. Check with: pm2 status"
