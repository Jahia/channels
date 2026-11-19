#!/bin/bash
# Stops and removes the Jahia container and its volumes.
cd "$(dirname "$0")" || exit 1
source ./set-env.sh
JAHIA_LICENSE=unused docker-compose down -v
