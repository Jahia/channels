#!/bin/bash
# Exports the harness settings: harness.env (defaults), then .env (local overrides, gitignored) if present.
# Usage: source set-env.sh
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
source "${HARNESS_DIR}/harness.env"
if [[ -f "${HARNESS_DIR}/.env" ]]; then
  source "${HARNESS_DIR}/.env"
fi
set +a
